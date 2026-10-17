import { createMDX } from 'fumadocs-mdx/next';
import { createNextStory } from '@fumadocs/story/next';

const withMDX = createMDX();
const withStory = createNextStory();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  devIndicators: false,
  agentRules: false,
};

export default withStory(withMDX(config));
