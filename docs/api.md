# Local API

All routes are same-origin under `/api`. JSON errors have `{error:string}`. Unknown IDs return 404. Invalid input returns 400 and conflicts return 409. The server accepts only its loopback Host and rejects cross-origin browser requests.

| Method and path                                  | Body / result                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| GET /engines                                     | Available CLI engines, models, effort values, capability caveats |
| GET /health                                      | Dependency checks                                                |
| GET /projects                                    | Project array, most recently updated first                       |
| POST /projects                                   | `{name,folderId?}` → Project; omitted/null folder means unfiled    |
| DELETE /projects/:id                             | Permanently remove project and its files → 204; busy → 409        |
| PUT /projects/:id/folder                          | `{folderId:string|null}` → Project; null removes folder assignment |
| GET /folders                                     | Folder array                                                     |
| POST /folders                                    | `{name}` → Folder; duplicate names → 409                          |
| DELETE /folders/:id                              | Remove folder, keep its projects unfiled → 204                   |
| GET /projects/:id                                | Project                                                          |
| PUT /projects/:id                                | `{name?,document?,revision?}` → Project                          |
| POST /projects/:id/assets                        | Multipart `files` (at most 10, 512 MiB each) → Project           |
| GET /projects/:id/assets/:assetId                | Media bytes with range support                                   |
| POST /projects/:id/references                    | `{url}` → `{job,project}`; at most 5                             |
| POST /projects/:id/references/:referenceId/retry | Retry a failed reference → Job                                   |
| GET /projects/:id/chat                           | `{running,text,status,error?,project}` current turn snapshot     |
| POST /projects/:id/chat                          | `{message,engine,model?,effort?,assetIds?}` → SSE                |
| POST /projects/:id/cancel                        | Cancel running agent                                             |
| POST /projects/:id/export                        | Start HyperFrames export → Job                                   |
| GET /jobs/:id                                    | Job status                                                       |
| GET /jobs/:id/download                           | Completed MP4                                                    |

Chat SSE data is JSON. Events: `text` with incremental `text`, `status` with `text`, `session` with `sessionId`, `usage` with `inputTokens` and `outputTokens`, `error` with `error`, and `done` with the saved `project`. A comment heartbeat keeps the stream alive. Disconnecting the stream does not cancel the agent. Returning clients read the chat snapshot to recover progress and the Stop control; polling while active retrieves the final saved project. Only explicit cancellation, server shutdown, or the existing 30-minute limit stops a turn. Live progress and the latest error are held in server memory (up to 1,000 idle projects); completed text stays in persisted message history. The server owns history persistence; clients do not submit history or provider session IDs.

Media and project data types are defined in `src/shared/types.ts`. The server validates document data using `server/store.ts`; the agent contract documents supported fields. Arbitrary JSON properties are not an extension API.
