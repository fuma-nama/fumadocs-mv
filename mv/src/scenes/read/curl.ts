import * as THREE from 'three';

/**
 * The title page as a physical sheet (B1): hinged on its left edge (x = -W/2), it can lift a
 * corner (curl region beyond a diagonal fold line) and turn over to the left.
 * Cross-section per row: flat at hinge angle θ up to s0(y), then an arc of radius R up to an
 * extra angle φmax, then flat again. World units = css px of the 1440×810 page.
 */
export interface CurlParams {
  /** hinge angle (rad): 0 flat, π turned over to the left */
  theta: number;
  /** curl start (distance from the hinge) on the bottom row */
  s0: number;
  /** fold line slope: s0 grows by slope·(y + H/2) toward the top row (diagonal, corner first) */
  slope: number;
  R: number;
  /** extra curl angle (rad), may be negative (free edge trails) */
  phi: number;
  /** lift of the whole sheet above its rest plane */
  lift: number;
  /** translation (world) */
  dx: number;
}

const NS = 120;
const NY = 36;

export class Sheet {
  readonly W: number;
  readonly H: number;
  readonly z0: number;
  readonly mesh: THREE.Mesh;
  readonly edge: THREE.Mesh;
  readonly shadowMesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  private geo: THREE.BufferGeometry;
  private edgeGeo: THREE.BufferGeometry;
  private pos: Float32Array;
  private nrm: Float32Array;
  private epos: Float32Array;

  constructor(W: number, H: number, z0: number) {
    this.W = W;
    this.H = H;
    this.z0 = z0;
    const nv = (NS + 1) * (NY + 1);
    this.pos = new Float32Array(nv * 3);
    this.nrm = new Float32Array(nv * 3);
    const uv = new Float32Array(nv * 2);
    const idx: number[] = [];
    for (let j = 0; j <= NY; j++)
      for (let i = 0; i <= NS; i++) {
        const k = j * (NS + 1) + i;
        uv[k * 2] = i / NS;
        uv[k * 2 + 1] = j / NY;
        if (i < NS && j < NY) {
          const a = k, b = k + 1, c = k + NS + 1, d = k + NS + 2;
          idx.push(a, b, d, a, d, c);
        }
      }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        front: { value: null },
        paper: { value: new THREE.Color(0.925, 0.918, 0.89) },
        light: { value: new THREE.Vector3(0.4, 0.42, 0.82).normalize() },
        shade: { value: 0.45 },
        showThrough: { value: 0.07 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D front; uniform vec3 paper; uniform vec3 light; uniform float shade; uniform float showThrough;
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        vec3 toLin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
        vec3 toSrgb(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        float hashD(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        vec3 dither8(vec3 lin, float amp){ vec2 p = gl_FragCoord.xy; float n = hashD(p) + hashD(p + 19.19) - 1.0; return toLin(toSrgb(lin) + n * amp / 255.0); }
        void main(){
          vec3 n = normalize(vN);
          vec4 f = texture2D(front, vUv);
          vec3 fc = toLin(f.rgb);
          float l0 = dot(vec3(0.0, 0.0, 1.0), light);
          if (gl_FrontFacing) {
            float l = clamp(dot(n, light) / l0, 0.0, 1.08);
            float k = mix(1.0, l, shade);
            // soft specular sheen on the curl crest
            vec3 v = normalize(cameraPosition - vW);
            float sp = pow(max(dot(reflect(-light, n), v), 0.0), 24.0) * 0.06 * (1.0 - n.z);
            // dither only where the curl shades the paper (the flat sheet stays pixel-exact with B1's f.other)
            gl_FragColor = vec4(dither8(fc * k + sp, 1.2 * smoothstep(0.0, 0.01, abs(k - 1.0) + sp)), 1.0);
          } else {
            vec3 nb = -n;
            float l = clamp(dot(nb, light) / l0, 0.0, 1.08);
            float k = mix(1.0, l, shade) * 0.93;
            float ink = 1.0 - dot(f.rgb, vec3(0.2126, 0.7152, 0.0722));
            vec3 col = toLin(paper) * (1.0 - showThrough * ink * 1.4) * k;
            gl_FragColor = vec4(dither8(col, 1.2), 1.0);
          }
        }`,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noEdges = true;

    // thickness: a ribbon along the free edge + top/bottom edges
    const ne = (NS + 1) * 2 + (NY + 1); // top row, bottom row, free edge
    this.epos = new Float32Array(ne * 2 * 3);
    const eidx: number[] = [];
    for (let k = 0; k < ne - 1; k++) {
      if (k === NS || k === 2 * NS + 1) continue; // breaks between strips
      const a = k * 2, b = k * 2 + 1, c = (k + 1) * 2, d = (k + 1) * 2 + 1;
      eidx.push(a, c, b, b, c, d);
    }
    this.edgeGeo = new THREE.BufferGeometry();
    this.edgeGeo.setAttribute('position', new THREE.BufferAttribute(this.epos, 3));
    this.edgeGeo.setIndex(eidx);
    this.edge = new THREE.Mesh(this.edgeGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfcabd'), side: THREE.DoubleSide }));
    this.edge.frustumCulled = false;
    this.edge.userData.noEdges = true;

    // shadow caster: same geometry, projected along the light onto z = 0 in shadowPass
    this.shadowMesh = new THREE.Mesh(
      this.geo,
      new THREE.ShaderMaterial({
        uniforms: { L: { value: new THREE.Vector3(0.4, 0.42, 0.82).normalize() }, ground: { value: 0 } },
        vertexShader: /* glsl */ `
          uniform vec3 L; uniform float ground; varying float vH;
          void main(){ vec4 w = modelMatrix * vec4(position, 1.0); float h = max(w.z - ground, 0.0); vH = h; vec3 p = w.xyz - L * (h / L.z); gl_Position = projectionMatrix * viewMatrix * vec4(p.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `varying float vH; void main(){ float h = clamp(vH / 300.0, 0.0, 1.0); gl_FragColor = vec4(h, h, h, 1.0); }`,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        transparent: false,
      }),
    );
    this.shadowMesh.frustumCulled = false;
  }

  /** Row geometry: position (x, z) and tangent angle at arc length s. */
  private row(s: number, y: number, p: CurlParams): [number, number, number] {
    const s0 = p.s0 + (y + this.H / 2) * p.slope;
    const ct = Math.cos(p.theta), st = Math.sin(p.theta);
    if (s <= s0 || Math.abs(p.phi) < 1e-5) return [s * ct, s * st, p.theta];
    const R = p.R * Math.sign(p.phi);
    const arc = Math.abs(p.phi) * p.R;
    const x0 = s0 * ct, z0 = s0 * st;
    const u = Math.min(s - s0, arc);
    const a = p.theta + u / R;
    let x = x0 + R * (Math.sin(a) - st);
    let z = z0 + R * (ct - Math.cos(a));
    if (s - s0 > arc) {
      const r = s - s0 - arc;
      x += r * Math.cos(a);
      z += r * Math.sin(a);
    }
    return [x, z, a];
  }

  update(p: CurlParams) {
    const W = this.W, H = this.H;
    const pos = this.pos, nrm = this.nrm;
    const x0 = -W / 2 + p.dx;
    for (let j = 0; j <= NY; j++) {
      const y = -H / 2 + (j / NY) * H;
      for (let i = 0; i <= NS; i++) {
        const s = (i / NS) * W;
        const [x, z, a] = this.row(s, y, p);
        const k = (j * (NS + 1) + i) * 3;
        pos[k] = x0 + x;
        pos[k + 1] = y;
        pos[k + 2] = this.z0 + p.lift + z;
        nrm[k] = -Math.sin(a);
        nrm[k + 1] = 0;
        nrm[k + 2] = Math.cos(a);
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.geo.computeBoundingSphere();
    // edges: ribbons offset ±t/2 along the normal
    const t = 1.6;
    const ep = this.epos;
    let e = 0;
    const put = (k: number) => {
      const px = pos[k], py = pos[k + 1], pz = pos[k + 2];
      const nx = nrm[k], nz = nrm[k + 2];
      ep[e++] = px + nx * t * 0.5;
      ep[e++] = py;
      ep[e++] = pz + nz * t * 0.5;
      ep[e++] = px - nx * t * 0.5;
      ep[e++] = py;
      ep[e++] = pz - nz * t * 0.5;
    };
    for (let i = 0; i <= NS; i++) put((NY * (NS + 1) + i) * 3); // top row
    for (let i = 0; i <= NS; i++) put(i * 3); // bottom row
    for (let j = 0; j <= NY; j++) put((j * (NS + 1) + NS) * 3); // free edge
    this.edgeGeo.attributes.position.needsUpdate = true;
  }
}
