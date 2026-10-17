/**
 * Ambient declarations for the stylesheet side-effect imports the Expo starter
 * ships (`@/global.css`, `*.module.css`). Metro resolves these at bundle time;
 * only `tsc` needs to be told they exist.
 */

declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.png' {
  const value: import('expo-image').ImageSource | string;
  export default value;
}

declare module '*.jpg' {
  const value: import('expo-image').ImageSource | string;
  export default value;
}

declare module '*.svg' {
  const value: import('expo-image').ImageSource | string;
  export default value;
}

declare module '*.ttf' {
  const value: number;
  export default value;
}
