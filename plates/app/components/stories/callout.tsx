'use client';
import { Callout } from 'fumadocs-ui/components/callout';
import type { ComponentProps } from 'react';

// same as the Callout story on fumadocs.dev (integrations/story/client.tsx)
export function CalloutStory(props: Pick<ComponentProps<typeof Callout>, 'title' | 'type' | 'children'>) {
  return (
    <div className="p-3 bg-fd-background border rounded-md">
      <Callout {...props} />
    </div>
  );
}
