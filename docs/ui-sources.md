# UI research and source acknowledgements

Reviewed 13 November 2026. short.it has its own identity, copy, layout implementation, and editor logic. The interface uses neutral black and white surfaces with blue reserved for selection and assistant activity. All media, projects, counts, connection states, and generation results in the product come from the local API; there are no seeded demo projects.

## CapCut workflow research

The official [How to Use CapCut](https://www.capcut.com/resource/how-to-use-capcut) guide documents the import → edit → export workflow, direct drag-and-drop into a timeline, split/delete tools above tracks, contextual controls on the right, and media/text resources on the left. The official [CapCut for Laptop](https://www.capcut.com/resource/capcut-for-laptop) guide provides desktop and online editor examples and describes imported media, a central preview, and timeline editing. The official [video editor product page](https://www.capcut.com/tools/video-editor) was reviewed as a product entry point.

The resulting short.it workspace keeps the same familiar spatial responsibilities: media and reference library at left; preview in the center; properties at right; timeline below; export in the upper right. The assistant replaces the initial need to navigate a large effects catalogue, while manual text, shape, transform, timing, trimming, splitting, visibility, locking, volume, and fade controls remain available. A selected element is the same object on the canvas, inspector, and timeline. Dragging a canvas element changes its position; the corner changes its size. Timeline dragging moves a clip, vertical dragging changes its layer, and edges trim it. Keyboard alternatives cover selection, precise movement, undo/redo, duplication, deletion, splitting, and playback.

No CapCut code, assets, logos, or screenshots are redistributed. These are workflow references, not claims of compatibility with CapCut project files.

### Direct editing interactions

The official [PC and Mac editing guide](https://www.capcut.com/resource/how-to-use-capcut-on-pc) was also reviewed for selection, timeline tools, and the division between media, preview, and properties. The following interactions are implemented locally for short.it; they do not imply complete CapCut feature parity:

- Drag an empty area of the preview or timeline to box-select elements. Shift/Ctrl/Command-click adds or removes an element. Move, duplicate, delete, or nudge the selected elements together; a drag is one undo step. Locked elements remain protected.
- Drag the dividers to change assistant width, properties width, or timeline height. Focus a divider and use arrow keys for the same adjustment; double-click restores its default size. Dimensions are remembered locally and bounded to the available window.
- Click the active left navigation tab to collapse or reopen its panel. Collapsing the assistant keeps its conversation mounted and does not cancel its generation.
- Fit canvas changes the preview zoom. Fullscreen preview uses the browser's [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API); when the host denies that API, the preview expands inside the application window. Escape or the exit control restores the editor.

These interactions are covered by isolated browser fixtures, without modifying personal projects or invoking paid models.

## 21st.dev component research

The following components were reviewed for a restrained, keyboard-friendly editing application. The catalogue pages establish authorship and their published licenses; source links identify the underlying implementation.

| Component | Catalogue and original source | Use in short.it |
| --- | --- | --- |
| Prompt with Model Picker, MM Rahman Bappi | [21st catalogue](https://21st.dev/@mmrahmanbappi/components/model-picker-prompt), [original MIT HTML/CSS/JS](https://raw.githubusercontent.com/mmrahmanbappi/100-free-ai-ui-components/main/prompt-input/model-picker-prompt/component.html) | Adapted prompt composition, autosizing textarea, compact model/effort controls, attachment/send action row, focus-within state, reduced-motion support. Rewritten in React and connected to real model discovery and SSE. |
| Tabs, haassiib / 96 Group | [21st catalogue](https://21st.dev/@haassiib/components/tabs-roving-focus), [original MIT React source](https://raw.githubusercontent.com/haassiib/admin-ui-kit/main/src/components/layout/Tabs.tsx) | Adapted into `Tabs` in `src/components/ui.tsx`: roving tabindex, selected state, controlled selection, linked tab/panel IDs, arrow navigation; extended with Home/End. Styling uses this application's plain CSS. |
| Web Search Indicator, MM Rahman Bappi | [21st catalogue](https://21st.dev/@mmrahmanbappi/components/tool-call-indicator), [original MIT source](https://raw.githubusercontent.com/mmrahmanbappi/100-free-ai-ui-components/main/thinking/tool-call-indicator/component.html) | Reviewed its compact status and source-chip treatment. short.it shows actual streamed assistant status; its simulated source/timer demo is not used. |
| Prompt Composer, Spectrum UI | [21st catalogue](https://21st.dev/@arihantcodes_1f7b8c4d/components/prompt-composer), [original registry](https://ui.spectrumhq.in/r/prompt-composer.json) | Reviewed attachment/model/generating-stop composition. The registry source was inaccessible during research, so no source is copied. |
| File Upload, Extend | [21st catalogue](https://21st.dev/@extend-hq/components/file-upload), [original documentation](https://ui.extend.ai/ui/docs/components/file-upload) | Reviewed compact drag-and-drop and file-list pattern. Native file input and drag events are implemented locally; the animated beam and extra icon dependencies are not included. |
| Sidebar Light, inference-sh | [21st catalogue](https://21st.dev/@inference-sh/components/sidebar-light), [original source entry](https://ui.inference.sh/blocks/sidebar-light) | Reviewed navigation hierarchy and active-route treatment. Source entry was inaccessible; no code copied. |
| Expandable Tabs, Ryan Cuff / easeUI | [21st catalogue](https://21st.dev/@rjcuff2000/components/expandable-tabs) | Reviewed icon/label density. Rejected animated expansion in a frequently used editor rail. |
| Animated Tabs, kuratlielia / Arc | [21st catalogue](https://21st.dev/@kuratlielia/components/tabs), [MIT registry source](https://raw.githubusercontent.com/kuratlielia/arc-library/main/public/r/tabs.json) | Reviewed selection feedback. Native controlled tabs were a smaller fit than adding Motion and Radix. |

Reusable UI primitives in `src/components/ui.tsx` include buttons, icon buttons, native modal dialogs, tabs, selects, a dropzone, and save/activity status. The project also provides attachment chips, mention suggestions, project tiles, reference cards, a media library, numeric/color fields, transport controls, and a timeline. These are implemented for short.it; the table distinguishes source adaptations from design research rather than attributing every primitive to the catalogue.

## Adapted-source licenses

### Prompt with Model Picker

MIT License

Copyright (c) MM Rahman Bappi — 100 Free AI UI Components

### Tabs

MIT License

Copyright (c) 2026 96 Group

The following MIT terms apply to each adapted source above:

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Fonts and icons

The preview and HyperFrames renderer use the same locally bundled Montserrat and Space Mono files in `public/fonts`. Their OFL notices are included alongside the font files. The interface makes no font-CDN requests. Icons are from the installed `lucide-react` package under its ISC license. See the dependency lockfile and installed package notices for dependency attribution.
