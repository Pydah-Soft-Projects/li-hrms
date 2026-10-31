import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'pydah-sso-loader': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      'pydah-portal-switcher': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }

  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'pydah-sso-loader': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
        'pydah-portal-switcher': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      }
    }
  }
}
