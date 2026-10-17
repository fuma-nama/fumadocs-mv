import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Banner } from 'fumadocs-ui/components/banner';
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';
import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import type { MDXComponents } from 'mdx/types';
import * as icons from '@/components/icons';

/** replace a placeholder inside highlighted code tokens (keeps the token's own colour) */
function replaceText(node: ReactNode, from: string, to: string): ReactNode {
  if (typeof node === 'string') return node.includes(from) ? node.replaceAll(from, to) : node;
  if (Array.isArray(node)) return node.map((child) => replaceText(child, from, to));
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined) {
    return cloneElement(node, {
      children: Children.map(node.props.children, (child) => replaceText(child, from, to)),
    } as never);
  }
  return node;
}

/** the preset stylesheets fumadocs-ui ships (packages/radix-ui/css); other routes (orange, a primary
 *  override on neutral) import neutral.css, as fumadocs.dev does (apps/docs/app/global.css) */
const CSS_PRESETS = new Set(['neutral', 'black', 'vitepress', 'dusk', 'catppuccin', 'ocean', 'purple', 'solar', 'emerald', 'ruby', 'aspen', 'shadcn']);

export function getMDXComponents(components?: MDXComponents, preset = 'neutral'): MDXComponents {
  const cssPreset = CSS_PRESETS.has(preset) ? preset : 'neutral';
  return {
    ...defaultMdxComponents,
    pre: (props) => (
      <CodeBlock {...props}>
        <Pre>{replaceText(props.children, '__PRESET__', cssPreset)}</Pre>
      </CodeBlock>
    ),
    Tab,
    Tabs,
    Step,
    Steps,
    File,
    Files,
    Folder,
    TypeTable,
    Accordion,
    Accordions,
    Banner,
    ...icons,
    ...components,
  };
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
