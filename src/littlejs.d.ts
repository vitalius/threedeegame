// LittleJS's d.ts marks engineInit's post/render callbacks as required,
// but the runtime accepts the 2-arg call. Add the matching overload.

export {};

declare module 'littlejsengine' {
  export function engineInit(
    gameInit: GameInitCallback,
    gameUpdate: GameCallback,
    gameUpdatePost?: GameCallback,
    gameRender?: GameCallback,
    gameRenderPost?: GameCallback,
    imageSources?: Array<string>,
    rootElement?: HTMLElement,
  ): Promise<void>;
}
