'use client';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { cn } from 'cn';

export interface ButtonProps {
  /** button text */
  children?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md';
  disabled?: boolean;
}

export function Button({ children = 'Get Started', variant = 'primary', size = 'md', disabled = false }: ButtonProps) {
  return (
    <div className="flex items-center justify-center p-8 bg-fd-background border rounded-md">
      <button type="button" disabled={disabled} className={cn(buttonVariants({ variant, size: size === 'sm' ? 'sm' : undefined }), size === 'md' && 'px-4 py-2')}>
        {children}
      </button>
    </div>
  );
}
