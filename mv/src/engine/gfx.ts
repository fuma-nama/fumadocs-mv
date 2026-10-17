import * as THREE from 'three';

/**
 * Screen-space compositor + effects. Convention: every 2D/composite texture holds
 * PREMULTIPLIED, sRGB-encoded colour (design-tool style blending). 3D render targets hold
 * linear premultiplied colour and are converted when composited (`linear: true`).
 */

export type Blend = 'normal' | 'add' | 'screen' | 'multiply' | 'difference' | 'overlay' | 'erase';

export interface Xform {
  x?: number; // px offset
  y?: number;
  scale?: number;
  sx?: number;
  sy?: number;
  rot?: number; // radians
  /** pivot in px relative to the frame centre */
  px?: number;
  py?: number;
}

export interface LayerSpec {
  tex: THREE.Texture | null | undefined;
  blend?: Blend;
  opacity?: number;
  /** texture holds linear colour (3D render) */
  linear?: boolean;
  xform?: Xform;
  /** multiply colour (sRGB) */
  tint?: string | THREE.Color;
  /** alpha mask texture: layer alpha *= mask (alpha channel, or luminance if maskLuma) */
  mask?: THREE.Texture;
  maskLuma?: boolean;
  maskInvert?: boolean;
}

const HEAD = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 outColor;
vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
vec3 toLinear(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

const VERT = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function mat(frag: string, uniforms: Record<string, THREE.IUniform>, blending?: Partial<THREE.Material>) {
  const m = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: HEAD + frag,
    uniforms,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  Object.assign(m, blending ?? { blending: THREE.NoBlending });
  return m;
}

const BLEND_STATES: Record<'normal' | 'add' | 'screen' | 'multiply' | 'erase', Partial<THREE.Material>> = {
  normal: { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor },
  add: { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor },
  screen: { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor },
  multiply: { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor },
  erase: { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor },
};

const LAYER_FRAG = /* glsl */ `
uniform sampler2D tex;
uniform sampler2D maskTex;
uniform sampler2D dstTex;
uniform vec2 res;
uniform vec2 texRes;
uniform mat3 inv;      // output px (centred) -> source px (centred)
uniform float opacity;
uniform vec3 tint;
uniform int linearIn;
uniform int maskMode;  // 0 none, 1 alpha, 2 luma, +10 invert
uniform int mode;      // 0 plain (hardware blend), 1 difference, 2 overlay
void main(){
  vec2 p = (vUv - 0.5) * res;
  vec2 q = (inv * vec3(p, 1.0)).xy;
  vec2 uv = q / texRes + 0.5;
  vec4 c = texture(tex, uv);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) c = vec4(0.0);
  if (linearIn == 1 && c.a > 0.0) { vec3 s = toSRGB(c.rgb / c.a); c.rgb = s * c.a; }
  c.rgb *= tint;
  if (maskMode > 0) {
    vec4 m = texture(maskTex, vUv);
    float k = (maskMode % 10 == 2) ? luma(m.rgb) : m.a;
    if (maskMode >= 10) k = 1.0 - k;
    c *= k;
  }
  c *= opacity;
  if (mode == 0) { outColor = c; return; }
  vec4 d = texture(dstTex, vUv);
  vec3 sc = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
  vec3 dc = d.a > 0.0 ? d.rgb / d.a : vec3(0.0);
  vec3 r;
  if (mode == 1) r = abs(dc - sc);
  else r = mix(2.0 * dc * sc, 1.0 - 2.0 * (1.0 - dc) * (1.0 - sc), step(0.5, dc));
  vec3 outc = mix(dc, r, c.a);
  float a = c.a + d.a * (1.0 - c.a);
  outColor = vec4(outc * a, a);
}`;

export class Gfx {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly quad: THREE.Mesh;
  private pool = new Map<string, THREE.WebGLRenderTarget>();
  private layerMats: Record<string, THREE.RawShaderMaterial> = {};
  private mats = new Map<string, THREE.RawShaderMaterial>();
  readonly white: THREE.DataTexture;
  readonly clear: THREE.DataTexture;

  /** actual px per design px (1 at 1920×1080, 2 at 3840×2160) */
  readonly S: number;
  /** actual output size in px */
  readonly PW: number;
  readonly PH: number;

  /** W/H are design units (1920×1080); PW/PH the real output size. */
  constructor(
    readonly renderer: THREE.WebGLRenderer,
    readonly W: number,
    readonly H: number,
    S = 1,
  ) {
    this.S = S;
    this.PW = Math.round(W * S);
    this.PH = Math.round(H * S);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(g);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.white.needsUpdate = true;
    this.clear = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    this.clear.needsUpdate = true;
    for (const k of ['normal', 'add', 'screen', 'multiply', 'erase', 'shader'] as const) {
      this.layerMats[k] = mat(LAYER_FRAG, {
        tex: { value: null }, maskTex: { value: this.white }, dstTex: { value: this.clear },
        res: { value: new THREE.Vector2() }, texRes: { value: new THREE.Vector2() }, inv: { value: new THREE.Matrix3() },
        opacity: { value: 1 }, tint: { value: new THREE.Color(1, 1, 1) }, linearIn: { value: 0 }, maskMode: { value: 0 }, mode: { value: 0 },
      }, k === 'shader' ? { blending: THREE.NoBlending } : BLEND_STATES[k]);
    }
  }

  /** Persistent render target (sRGB/premultiplied, 8-bit unless float). w/h in design units. */
  rt(key: string, w = this.W, h = this.H, o: { float?: boolean; depth?: boolean; samples?: number } = {}): THREE.WebGLRenderTarget {
    w = Math.max(1, Math.round(w * this.S));
    h = Math.max(1, Math.round(h * this.S));
    let r = this.pool.get(key);
    if (!r || r.width !== w || r.height !== h) {
      r?.dispose();
      r = new THREE.WebGLRenderTarget(w, h, {
        type: o.float ? THREE.HalfFloatType : THREE.UnsignedByteType,
        depthBuffer: !!o.depth,
        samples: o.samples ?? 0,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      });
      this.pool.set(key, r);
    }
    return r;
  }

  run(m: THREE.Material, target: THREE.WebGLRenderTarget | null, clear?: [number, number, number, number] | null) {
    const r = this.renderer;
    this.quad.material = m;
    r.setRenderTarget(target);
    if (clear) {
      r.setClearColor(new THREE.Color(clear[0], clear[1], clear[2]), clear[3]);
      r.clear(true, false, false);
    }
    r.render(this.scene, this.camera);
  }

  /** Get-or-create a cached effect material. */
  material(key: string, frag: string, uniforms: Record<string, THREE.IUniform>, blending?: Partial<THREE.Material>) {
    let m = this.mats.get(key);
    if (!m) {
      m = mat(frag, uniforms, blending);
      this.mats.set(key, m);
    }
    return m;
  }

  /** Composite layers (bottom → top) into `target`, cleared to `bg` (CSS colour) or transparent. */
  compose(target: THREE.WebGLRenderTarget, bg: string | null, layers: LayerSpec[]): THREE.Texture {
    const r = this.renderer;
    r.setRenderTarget(target);
    const c = bg ? new THREE.Color(bg) : new THREE.Color(0, 0, 0);
    r.setClearColor(c, bg ? 1 : 0);
    r.clear(true, false, false);
    // three converts the clear colour to linear; we want raw sRGB values in the 8-bit target
    if (bg) this.fill(target, bg);
    for (const L of layers) this.drawLayer(target, L);
    return target.texture;
  }

  /** Fill a target with an opaque CSS colour (raw sRGB values). */
  fill(target: THREE.WebGLRenderTarget, color: string, alpha = 1) {
    const col = new THREE.Color().setStyle(color, THREE.NoColorSpace as THREE.ColorSpace);
    const m = this.material('fill', `uniform vec4 col; void main(){ outColor = col; }`, { col: { value: new THREE.Vector4() } });
    m.uniforms.col.value.set(col.r * alpha, col.g * alpha, col.b * alpha, alpha);
    this.run(m, target);
  }

  drawLayer(target: THREE.WebGLRenderTarget, L: LayerSpec) {
    if (!L.tex || (L.opacity ?? 1) <= 0) return;
    const blend = L.blend ?? 'normal';
    const shaderBlend = blend === 'difference' || blend === 'overlay';
    let dst: THREE.WebGLRenderTarget | undefined;
    if (shaderBlend) {
      dst = this.rt('__dst', target.width, target.height);
      this.copy(target.texture, dst);
    }
    const m = this.layerMats[shaderBlend ? 'shader' : blend];
    const u = m.uniforms;
    u.tex.value = L.tex;
    u.res.value.set(target.width, target.height);
    // compose layers are full-frame textures stretched to the target; position things via xform (px)
    u.texRes.value.set(target.width, target.height);
    u.inv.value.copy(invXform(L.xform, target.width / this.W));
    u.opacity.value = L.opacity ?? 1;
    u.tint.value = L.tint ? new THREE.Color().setStyle(typeof L.tint === 'string' ? L.tint : '#' + L.tint.getHexString(), THREE.NoColorSpace as THREE.ColorSpace) : new THREE.Color(1, 1, 1);
    u.linearIn.value = L.linear ? 1 : 0;
    u.maskTex.value = L.mask ?? this.white;
    u.maskMode.value = L.mask ? (L.maskLuma ? 2 : 1) + (L.maskInvert ? 10 : 0) : 0;
    u.mode.value = blend === 'difference' ? 1 : blend === 'overlay' ? 2 : 0;
    u.dstTex.value = dst ? dst.texture : this.clear;
    this.run(m, target);
  }

  copy(src: THREE.Texture, target: THREE.WebGLRenderTarget | null, linearIn = false) {
    const m = this.material('copy', `uniform sampler2D tex; uniform int lin; void main(){ vec4 c = texture(tex, vUv); if (lin == 1 && c.a > 0.0) c.rgb = toSRGB(c.rgb / c.a) * c.a; outColor = c; }`, { tex: { value: null }, lin: { value: 0 } });
    m.uniforms.tex.value = src;
    m.uniforms.lin.value = linearIn ? 1 : 0;
    this.run(m, target);
    return target?.texture ?? src;
  }

  // ── effects (each returns a texture in a pooled RT keyed by `key`) ──────────

  /** Separable gaussian blur. radius ~ px at full res. */
  blur(src: THREE.Texture, radius: number, key = 'blur', w = this.W, h = this.H): THREE.Texture {
    if (radius <= 0.01) return src;
    // downsample big blurs for speed
    radius *= this.S;
    const down = radius > 24 ? 4 : radius > 8 ? 2 : 1;
    const a = this.rt(key + ':a', w / down, h / down);
    const b = this.rt(key + ':b', w / down, h / down);
    const bw = a.width;
    const bh = a.height;
    const m = this.material('gblur', `
      uniform sampler2D tex; uniform vec2 dir; uniform float sigma;
      void main(){
        vec4 acc = vec4(0.0); float wsum = 0.0;
        for (int i = -16; i <= 16; i++) {
          float x = float(i);
          float wgt = exp(-0.5 * x * x / (sigma * sigma));
          acc += texture(tex, vUv + dir * x) * wgt; wsum += wgt;
        }
        outColor = acc / wsum;
      }`, { tex: { value: null }, dir: { value: new THREE.Vector2() }, sigma: { value: 1 } });
    const sigma = Math.min(radius / down / 2, 8);
    const step = Math.max(1, radius / down / 2 / 8);
    m.uniforms.sigma.value = sigma;
    m.uniforms.tex.value = src;
    m.uniforms.dir.value.set(step / bw, 0);
    this.run(m, a);
    m.uniforms.tex.value = a.texture;
    m.uniforms.dir.value.set(0, step / bh);
    this.run(m, b);
    return b.texture;
  }

  /** Soft-threshold bloom added on top of src. */
  bloom(src: THREE.Texture, o: { threshold?: number; knee?: number; strength?: number; radius?: number; tint?: string } = {}, key = 'bloom'): THREE.Texture {
    const hi = this.rt(key + ':hi', this.W / 2, this.H / 2);
    const tm = this.material('bloomThresh', `
      uniform sampler2D tex; uniform float th; uniform float knee;
      void main(){ vec4 c = texture(tex, vUv); float l = luma(c.rgb); float k = smoothstep(th - knee, th + knee, l); outColor = vec4(c.rgb * k, 1.0); }`,
      { tex: { value: null }, th: { value: 0.7 }, knee: { value: 0.2 } });
    tm.uniforms.tex.value = src;
    tm.uniforms.th.value = o.threshold ?? 0.72;
    tm.uniforms.knee.value = o.knee ?? 0.18;
    this.run(tm, hi);
    const b1 = this.blur(hi.texture, (o.radius ?? 24) * 0.5, key + ':b1', this.W / 2, this.H / 2);
    const b2 = this.blur(b1, (o.radius ?? 24) * 2, key + ':b2', this.W / 2, this.H / 2);
    const out = this.rt(key + ':out');
    const am = this.material('bloomAdd', `
      uniform sampler2D tex; uniform sampler2D b1; uniform sampler2D b2; uniform float s; uniform vec3 tint;
      void main(){ vec4 c = texture(tex, vUv); vec3 g = (texture(b1, vUv).rgb * 0.6 + texture(b2, vUv).rgb * 0.8) * s * tint; outColor = vec4(c.rgb + g * (1.0 - c.rgb * 0.5), max(c.a, min(1.0, luma(g)))); }`,
      { tex: { value: null }, b1: { value: null }, b2: { value: null }, s: { value: 1 }, tint: { value: new THREE.Color(1, 1, 1) } });
    am.uniforms.tex.value = src;
    am.uniforms.b1.value = b1;
    am.uniforms.b2.value = b2;
    am.uniforms.s.value = o.strength ?? 0.8;
    am.uniforms.tint.value.setStyle(o.tint ?? '#ffffff', THREE.NoColorSpace as THREE.ColorSpace);
    this.run(am, out);
    return out.texture;
  }

  /** Colour grade: saturation, contrast, brightness, duotone (mono→ink/paper), invert. */
  grade(src: THREE.Texture, o: { sat?: number; contrast?: number; bright?: number; duo?: number; ink?: string; paper?: string; invert?: number; gamma?: number }, key = 'grade') {
    const out = this.rt(key);
    const m = this.material('grade', `
      uniform sampler2D tex; uniform float sat; uniform float con; uniform float bri; uniform float duo; uniform vec3 ink; uniform vec3 paper; uniform float inv; uniform float gam;
      void main(){
        vec4 c = texture(tex, vUv);
        vec3 col = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
        float l = luma(col);
        col = mix(vec3(l), col, sat);
        col = (col - 0.5) * con + 0.5 + bri;
        col = pow(max(col, 0.0), vec3(gam));
        vec3 d = mix(ink, paper, clamp(luma(col), 0.0, 1.0));
        col = mix(col, d, duo);
        col = mix(col, 1.0 - col, inv);
        outColor = vec4(clamp(col, 0.0, 1.0) * c.a, c.a);
      }`, { tex: { value: null }, sat: { value: 1 }, con: { value: 1 }, bri: { value: 0 }, duo: { value: 0 }, ink: { value: new THREE.Color() }, paper: { value: new THREE.Color() }, inv: { value: 0 }, gam: { value: 1 } });
    const u = m.uniforms;
    u.tex.value = src;
    u.sat.value = o.sat ?? 1;
    u.con.value = o.contrast ?? 1;
    u.bri.value = o.bright ?? 0;
    u.duo.value = o.duo ?? 0;
    u.ink.value.setStyle(o.ink ?? '#0c0c10', THREE.NoColorSpace as THREE.ColorSpace);
    u.paper.value.setStyle(o.paper ?? '#ecebe6', THREE.NoColorSpace as THREE.ColorSpace);
    u.inv.value = o.invert ?? 0;
    u.gam.value = o.gamma ?? 1;
    this.run(m, out);
    return out.texture;
  }

  /** Horizontal slice glitch + RGB split. amount 0..1, seed changes the pattern (quantize time!). */
  glitch(src: THREE.Texture, o: { amount: number; seed: number; bands?: number; split?: number }, key = 'glitch') {
    if (o.amount <= 0) return src;
    const out = this.rt(key);
    const m = this.material('glitch', `
      uniform sampler2D tex; uniform float amt; uniform float seed; uniform float bands; uniform float split;
      void main(){
        vec2 uv = vUv;
        float band = floor(uv.y * bands);
        float r = hash12(vec2(band, seed));
        float r2 = hash12(vec2(band * 1.7, seed + 3.1));
        float on = step(1.0 - amt * 0.7, r);
        uv.x += on * (r2 - 0.5) * 0.25 * amt;
        float blk = step(1.0 - amt * 0.25, hash12(floor(vUv * vec2(24.0, 14.0)) + seed));
        uv += blk * (vec2(hash12(vec2(seed, band)), 0.0) - 0.5) * 0.08;
        float s = split * amt * (0.5 + on);
        vec4 c = texture(tex, uv);
        float rr = texture(tex, uv + vec2(s, 0.0)).r;
        float bb = texture(tex, uv - vec2(s, 0.0)).b;
        outColor = vec4(rr, c.g, bb, c.a);
      }`, { tex: { value: null }, amt: { value: 0 }, seed: { value: 0 }, bands: { value: 40 }, split: { value: 0.01 } });
    const u = m.uniforms;
    u.tex.value = src;
    u.amt.value = o.amount;
    u.seed.value = o.seed;
    u.bands.value = o.bands ?? 40;
    u.split.value = o.split ?? 0.012;
    this.run(m, out);
    return out.texture;
  }

  /** Pixelate + ordered dither onto a palette (P1PE-like retro render). */
  pixelate(src: THREE.Texture, o: { pixel: number; palette?: string[]; dither?: number; levels?: number }, key = 'pixel') {
    const out = this.rt(key);
    const pal = (o.palette ?? []).slice(0, 8).map((c) => new THREE.Color().setStyle(c, THREE.NoColorSpace as THREE.ColorSpace));
    const m = this.material('pixelate', `
      uniform sampler2D tex; uniform vec2 res; uniform float px; uniform vec3 pal[8]; uniform int n; uniform float dith; uniform float levels;
      float bayer(vec2 p){ int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0)); int i = x + y * 4;
        int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return (float(m[i]) + 0.5) / 16.0 - 0.5; }
      void main(){
        vec2 cell = floor(vUv * res / px);
        vec2 uv = (cell + 0.5) * px / res;
        vec4 c = texture(tex, uv);
        vec3 col = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
        float d = bayer(cell) * dith;
        if (n > 0) {
          float best = 1e9; vec3 bc = pal[0];
          vec3 q = col + d * 0.35;
          for (int i = 0; i < 8; i++) { if (i >= n) break; float e = dot(q - pal[i], q - pal[i]); if (e < best) { best = e; bc = pal[i]; } }
          col = bc;
        } else {
          col = floor(col * levels + 0.5 + d) / levels;
        }
        outColor = vec4(col * c.a, c.a);
      }`, { tex: { value: null }, res: { value: new THREE.Vector2() }, px: { value: 4 }, pal: { value: Array.from({ length: 8 }, () => new THREE.Color()) }, n: { value: 0 }, dith: { value: 1 }, levels: { value: 4 } });
    const u = m.uniforms;
    u.tex.value = src;
    u.res.value.set(this.PW, this.PH);
    u.px.value = o.pixel * this.S;
    pal.forEach((c, i) => (u.pal.value[i] as THREE.Color).copy(c));
    u.n.value = pal.length;
    u.dith.value = o.dither ?? 1;
    u.levels.value = o.levels ?? 4;
    this.run(m, out);
    return out.texture;
  }

  /** Halftone dots (ink on paper) from luminance. */
  halftone(src: THREE.Texture, o: { cell?: number; angle?: number; ink?: string; paper?: string; mix?: number }, key = 'halftone') {
    const out = this.rt(key);
    const m = this.material('halftone', `
      uniform sampler2D tex; uniform vec2 res; uniform float cellSize; uniform float ang; uniform vec3 ink; uniform vec3 paper; uniform float amt;
      void main(){
        vec2 p = vUv * res; float s = sin(ang), c = cos(ang);
        vec2 r = mat2(c, -s, s, c) * p; vec2 cell = floor(r / cellSize) + 0.5; vec2 ctr = mat2(c, s, -s, c) * (cell * cellSize);
        vec4 src = texture(tex, ctr / res); vec3 col = src.a > 0.0 ? src.rgb / src.a : vec3(1.0);
        float l = luma(col); float rad = sqrt(1.0 - l) * cellSize * 0.72;
        float d = length(r - cell * cellSize);
        float dotm = 1.0 - smoothstep(rad - 0.8, rad + 0.8, d);
        vec3 ht = mix(paper, ink, dotm);
        vec4 orig = texture(tex, vUv);
        vec3 oc = orig.a > 0.0 ? orig.rgb / orig.a : vec3(0.0);
        outColor = vec4(mix(oc, ht, amt) * orig.a, orig.a);
      }`, { tex: { value: null }, res: { value: new THREE.Vector2() }, cellSize: { value: 8 }, ang: { value: 0.4 }, ink: { value: new THREE.Color() }, paper: { value: new THREE.Color() }, amt: { value: 1 } });
    const u = m.uniforms;
    u.tex.value = src;
    u.res.value.set(this.PW, this.PH);
    u.cellSize.value = (o.cell ?? 8) * this.S;
    u.ang.value = o.angle ?? 0.4;
    u.ink.value.setStyle(o.ink ?? '#111111', THREE.NoColorSpace as THREE.ColorSpace);
    u.paper.value.setStyle(o.paper ?? '#ffffff', THREE.NoColorSpace as THREE.ColorSpace);
    u.amt.value = o.mix ?? 1;
    this.run(m, out);
    return out.texture;
  }

  /** Radial zoom blur (amount ~0.05–0.3) or directional blur (dir set). */
  motionBlur(src: THREE.Texture, o: { amount: number; center?: [number, number]; dir?: [number, number] }, key = 'mblur') {
    if (o.amount <= 0) return src;
    const out = this.rt(key);
    const m = this.material('mblur', `
      uniform sampler2D tex; uniform float amt; uniform vec2 ctr; uniform vec2 dir; uniform int radial;
      void main(){
        vec4 acc = vec4(0.0);
        for (int i = 0; i < 24; i++) {
          float k = float(i) / 23.0 - 0.5;
          vec2 off = radial == 1 ? (vUv - ctr) * k * amt : dir * k * amt;
          acc += texture(tex, vUv - off);
        }
        outColor = acc / 24.0;
      }`, { tex: { value: null }, amt: { value: 0 }, ctr: { value: new THREE.Vector2(0.5, 0.5) }, dir: { value: new THREE.Vector2() }, radial: { value: 1 } });
    const u = m.uniforms;
    u.tex.value = src;
    u.amt.value = o.amount;
    u.ctr.value.set(...(o.center ?? [0.5, 0.5]));
    u.radial.value = o.dir ? 0 : 1;
    if (o.dir) u.dir.value.set(...o.dir);
    this.run(m, out);
    return out.texture;
  }

  /** Two-input transition. p 0..1 (0 = all A). */
  transition(a: THREE.Texture, b: THREE.Texture, type: TransitionType, p: number, seed = 0, key = 'trans') {
    const out = this.rt(key);
    const types: Record<TransitionType, number> = { cut: 0, flash: 1, glitch: 2, wipe: 3, shutter: 4, iris: 5, slide: 6, zoom: 7, dissolve: 8, stripes: 9 };
    const m = this.material('transition', `
      uniform sampler2D A; uniform sampler2D B; uniform float p; uniform int ty; uniform float seed; uniform vec2 res;
      vec4 over(vec4 top, vec4 bot){ return top + bot * (1.0 - top.a); }
      void main(){
        vec2 uv = vUv; vec4 a = texture(A, uv); vec4 b = texture(B, uv);
        if (ty == 0) { outColor = p < 0.5 ? a : b; return; }
        if (ty == 1) { float f = 1.0 - abs(p * 2.0 - 1.0); vec4 base = p < 0.5 ? a : b; outColor = mix(base, vec4(1.0), pow(f, 1.5)); return; }
        if (ty == 2) {
          float band = floor(uv.y * 28.0 + hash12(vec2(floor(uv.x * 6.0), seed)) * 3.0);
          float r = hash12(vec2(band, seed));
          float off = (hash12(vec2(band, seed + 9.0)) - 0.5) * 0.3 * (1.0 - abs(p * 2.0 - 1.0));
          vec4 aa = texture(A, uv + vec2(off, 0.0)); vec4 bb = texture(B, uv + vec2(off, 0.0));
          outColor = r < p ? bb : aa; return;
        }
        if (ty == 3) { float d = (uv.x * res.x / res.y + uv.y) / (res.x / res.y + 1.0); float e = p * 1.2 - 0.1; float m = smoothstep(e - 0.002, e + 0.002, d); float band = step(abs(d - e), 0.02); vec4 c = mix(b, a, m); outColor = mix(c, vec4(1.0), band * step(0.001, p) * step(p, 0.999)); return; }
        if (ty == 4) { float n = 12.0; float row = fract(uv.y * n); float m = step(row, p); outColor = mix(a, b, m); return; }
        if (ty == 5) { vec2 d = (uv - 0.5) * vec2(res.x / res.y, 1.0); float r = length(d); float m = step(r, p * 1.2); outColor = mix(a, b, m); return; }
        if (ty == 6) { float e = 1.0 - pow(1.0 - p, 4.0); vec2 ua = uv + vec2(e, 0.0); vec2 ub = uv - vec2(1.0 - e, 0.0); outColor = ub.x >= 0.0 ? texture(B, ub) : texture(A, ua); return; }
        if (ty == 7) {
          vec4 acc = vec4(0.0); float s = (1.0 - abs(p * 2.0 - 1.0)) * 0.35;
          for (int i = 0; i < 16; i++) { float k = float(i) / 15.0; vec2 q = (uv - 0.5) * (1.0 - s * k) + 0.5; acc += p < 0.5 ? texture(A, q) : texture(B, q); }
          outColor = acc / 16.0; return;
        }
        if (ty == 8) { outColor = mix(a, b, p); return; }
        if (ty == 9) { float d = uv.x + uv.y * res.y / res.x * 0.6; float stripe = fract(d * 9.0); float m = step(stripe, p * 1.15 - 0.05 + (d - 0.8) * 0.0); outColor = mix(a, b, m); return; }
        outColor = b;
      }`, { A: { value: null }, B: { value: null }, p: { value: 0 }, ty: { value: 0 }, seed: { value: 0 }, res: { value: new THREE.Vector2() } });
    const u = m.uniforms;
    u.A.value = a;
    u.B.value = b;
    u.p.value = p;
    u.ty.value = types[type];
    u.seed.value = seed;
    u.res.value.set(this.PW, this.PH);
    this.run(m, out);
    return out.texture;
  }

  /** Lens pass on the scene only (before overlays): chromatic aberration + camera shake. */
  lens(src: THREE.Texture, o: PostState): THREE.Texture {
    if (o.ca <= 0 && o.shake[0] === 0 && o.shake[1] === 0) return src;
    const out = this.rt('__lens');
    const m = this.material('lens', `
      uniform sampler2D tex; uniform vec2 res; uniform float ca; uniform vec2 shake;
      void main(){
        vec2 uv = vUv + shake / res;
        vec2 d = uv - 0.5;
        vec4 c = texture(tex, uv);
        if (ca > 0.0) { c.r = texture(tex, uv + d * ca).r; c.b = texture(tex, uv - d * ca).b; }
        outColor = c;
      }`, { tex: { value: null }, res: { value: new THREE.Vector2() }, ca: { value: 0 }, shake: { value: new THREE.Vector2() } });
    const u = m.uniforms;
    u.tex.value = src;
    u.res.value.set(this.PW, this.PH);
    u.ca.value = o.ca;
    u.shake.value.set(o.shake[0] * this.S, -o.shake[1] * this.S);
    this.run(m, out);
    return out.texture;
  }

  /** Global finishing pass into `target` (null = canvas): film texture over scene + overlays. */
  finish(src: THREE.Texture, target: THREE.WebGLRenderTarget | null, o: PostState, frame: number) {
    const m = this.material('finish', `
      uniform sampler2D tex; uniform vec2 res; uniform float grain; uniform float vig; uniform float scan; uniform float flash; uniform vec3 flashCol; uniform float inv; uniform float mono; uniform float frame; uniform float fade;
      void main(){
        vec2 uv = vUv;
        vec2 d = uv - 0.5;
        vec4 c = texture(tex, uv);
        vec3 col = c.rgb;
        col = mix(col, vec3(luma(col)), mono);
        col = mix(col, 1.0 - col, inv);
        float v = 1.0 - vig * smoothstep(0.35, 0.95, length(d * vec2(res.x / res.y, 1.0)) / 0.9);
        col *= v;
        if (scan > 0.0) col *= 1.0 - scan * (0.5 + 0.5 * sin(vUv.y * res.y * 3.14159));
        float g = hash12(vUv * res + frame * 17.0) - 0.5;
        col += g * grain;
        col = mix(col, flashCol, flash);
        col *= 1.0 - fade;
        outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }`, { tex: { value: null }, res: { value: new THREE.Vector2() }, grain: { value: 0 }, vig: { value: 0 }, scan: { value: 0 }, flash: { value: 0 }, flashCol: { value: new THREE.Color(1, 1, 1) }, inv: { value: 0 }, mono: { value: 0 }, frame: { value: 0 }, fade: { value: 0 } });
    const u = m.uniforms;
    u.tex.value = src;
    u.res.value.set(this.PW, this.PH);
    u.grain.value = o.grain;
    u.vig.value = o.vignette;
    u.scan.value = o.scanlines;
    u.flash.value = o.flash;
    u.flashCol.value.setStyle(o.flashColor, THREE.NoColorSpace as THREE.ColorSpace);
    u.inv.value = o.invert;
    u.mono.value = o.mono;
    u.frame.value = frame % 1000;
    u.fade.value = o.fadeToBlack;
    this.run(m, target);
  }
}

export type TransitionType = 'cut' | 'flash' | 'glitch' | 'wipe' | 'shutter' | 'iris' | 'slide' | 'zoom' | 'dissolve' | 'stripes';

export interface PostState {
  grain: number;
  vignette: number;
  ca: number;
  scanlines: number;
  flash: number;
  flashColor: string;
  invert: number;
  mono: number;
  shake: [number, number];
  fadeToBlack: number;
}

export const defaultPost = (): PostState => ({
  grain: 0.04,
  vignette: 0.22,
  ca: 0.0008,
  scanlines: 0,
  flash: 0,
  flashColor: '#ffffff',
  invert: 0,
  mono: 0,
  shake: [0, 0],
  fadeToBlack: 0,
});

/** Inverse of: scale/rotate about pivot, then translate. Maps output px (centred, y up) → source px. */
function invXform(x: Xform | undefined, k: number): THREE.Matrix3 {
  const m = new THREE.Matrix3();
  if (!x) return m;
  x = { ...x, x: (x.x ?? 0) * k, y: (x.y ?? 0) * k, px: (x.px ?? 0) * k, py: (x.py ?? 0) * k };
  const sx = (x.sx ?? 1) * (x.scale ?? 1);
  const sy = (x.sy ?? 1) * (x.scale ?? 1);
  const r = x.rot ?? 0;
  const px = x.px ?? 0;
  const py = -(x.py ?? 0);
  const tx = x.x ?? 0;
  const ty = -(x.y ?? 0); // screen y down → shader y up
  // forward: p' = R*S*(p - pivot) + pivot + t
  const c = Math.cos(-r);
  const s = Math.sin(-r);
  // inverse: p = S^-1 * R^-1 * (p' - pivot - t) + pivot
  const a = c / sx;
  const b = s / sx;
  const d = -s / sy;
  const e = c / sy;
  const ox = -(px + tx);
  const oy = -(py + ty);
  m.set(a, b, a * ox + b * oy + px, d, e, d * ox + e * oy + py, 0, 0, 1);
  return m;
}
