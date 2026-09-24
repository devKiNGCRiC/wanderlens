/**
 * ExternalLink, a link that opens outside URLs in an in-app browser.
 *
 * Purpose: a leftover from the `create-expo-app` starter template (kebab-case
 * file names in components/ mark template files; the app's own components are
 * PascalCase). Nothing in app/ or elsewhere in the repo imports it today.
 *
 * How it works:
 * - Wraps expo-router's `<Link>` and forwards every prop except `href`.
 * - On native (iOS/Android) it cancels the default "open the system browser"
 *   behaviour and opens the page in an in-app browser sheet via
 *   expo-web-browser instead. On web it behaves as a normal new-tab link.
 */
import { Href, Link } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { type ComponentProps } from 'react';

/** All of `<Link>`'s props, but `href` is narrowed to a plain string URL. */
type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: Href & string };

/**
 * Renders a `<Link>` that opens `href` in an in-app browser on native.
 * Side effect on press (native only): launches expo-web-browser.
 */
export function ExternalLink({ href, ...rest }: Props) {
  return (
    <Link
      target="_blank"
      {...rest}
      href={href}
      onPress={async (event) => {
        if (process.env.EXPO_OS !== 'web') {
          // Prevent the default behavior of linking to the default browser on native.
          event.preventDefault();
          // Open the link in an in-app browser.
          await openBrowserAsync(href, {
            presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
          });
        }
      }}
    />
  );
}
