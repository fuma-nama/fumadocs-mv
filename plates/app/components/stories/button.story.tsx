import { defineStory } from '@/lib/story';
import { Button } from './button';

export const story = defineStory({
  displayName: 'Button',
  Component: Button,
  args: {
    initial: {
      children: 'Get Started',
      variant: 'primary',
      size: 'md',
      disabled: false,
    },
  },
});
