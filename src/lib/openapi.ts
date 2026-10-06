import "server-only";
import { z } from "zod";

import { COLOR_MODES, STORY_PRIORITIES, TIPS, WishSchema } from "@/lib/catalog";
import { ACCEPTED_EXTENSIONS, MAX_BYTES, formatBytes } from "@/lib/models";
import { FLOW } from "@/lib/scope";
import { IMPORT_SOURCES } from "@/lib/import-source";
import { BodySchema, LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX, ReasonSchema } from "@/lib/stories";
import { NOTIFICATION_LIMIT_MAX } from "@/lib/notifications";
import { OWNER_COOKIE, WHO_COOKIE } from "@/lib/identity-rules";

/**
 * The OpenAPI document, assembled at request time.
 *
 * Request shapes are not typed out twice: `z.toJSONSchema` converts the very
 * Zod schemas the handlers validate with, so the document cannot promise a
 * rule the server does not enforce, or miss one it does. Change `WishSchema`
 * and the upload's documented body changes with it.
 *
 * Assembled per request rather than at build time because the server URL
 * comes from the deployment's environment, and `next build` runs without it.
 */

/** OpenAPI 3.1 is a JSON Schema 2020-12 dialect, so this is a lift, not a translation. */
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const converted = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  // `$schema` is legal in a JSON Schema document and noise in a components
  // entry — every tool already knows the dialect from `openapi: "3.1.0"`.
  delete converted.$schema;
  return converted;
}

const ERROR = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "string",
      description: "One sentence, written for a person to read.",
      examples: ["Pick your name first."],
    },
  },
} as const;

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

/** The refusals every authenticated endpoint can answer with. */
const COMMON_ERRORS = {
  "401": errorResponse("No name picked yet."),
  "500": errorResponse("Something went wrong at our end. The message never carries detail."),
};

const STORY_SCHEMA = {
  type: "object",
  description:
    "A print request. `storageKey` — the object's name in the bucket — is " +
    "deliberately absent: the bytes are reachable only through `file.url`, " +
    "which re-checks who is asking.",
  required: ["id", "ref", "title", "status", "file", "uploader"],
  properties: {
    id: { type: "integer", examples: [4] },
    ref: {
      type: "string",
      description: "The display reference, `PPP-` + (100 + id). What people paste into chat.",
      examples: ["PPP-104"],
    },
    title: { type: "string", examples: ["Cable clip"] },
    status: { type: "string", enum: [...FLOW, "Declined"] },
    flagged: { type: "boolean" },
    flagReason: { type: ["string", "null"] },
    quantity: { type: "integer", minimum: 1 },
    priority: {
      type: "string",
      enum: [...STORY_PRIORITIES],
      description: "How much it matters to the requester. Orders the owner's queue; promises nothing else.",
    },
    material: {
      type: "string",
      description: "The owner-managed material label, snapshotted when the request was made.",
    },
    color: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The owner-managed colour label, snapshotted when the request was made.",
        },
        hex: {
          type: "string",
          examples: ["#4a5d78"],
          description: "One representative colour — what the 3D viewer paints the model with.",
        },
        style: {
          type: "string",
          examples: ["#4a5d78", "linear-gradient(135deg, #e4322f, #f6c945)"],
          description: "The swatch as a CSS background: a colour or a linear-gradient.",
        },
        mode: { type: "string", enum: [...COLOR_MODES] },
      },
    },
    tip: { type: "string", enum: [...TIPS] },
    note: { type: "string" },
    file: {
      type: "object",
      properties: {
        filename: { type: "string", examples: ["clip.stl"] },
        size: { type: "integer", description: "Bytes." },
        mimeType: { type: "string", examples: ["model/stl"] },
        dims: {
          type: ["string", "null"],
          description:
            "Bounding box measured from the mesh at upload time, honouring a " +
            "3MF `unit` attribute. Null for a file measured before this existed.",
          examples: ["41 × 22 × 9 mm"],
        },
        url: {
          type: "string",
          description:
            "Where the bytes are. Streamed by the app from its own disk — " +
            "model files are not in the web root, so there is no other URL.",
          examples: ["/api/models/4"],
        },
      },
    },
    source: {
      type: ["string", "null"],
      format: "uri",
      description:
        "The page the model was imported from, for a ticket opened with " +
        "`POST /api/import`. Null for an upload.",
      examples: ["https://www.printables.com/model/3161-3d-benchy"],
    },
    uploader: {
      type: "object",
      description: "Name and initials only. The address is not on the wire.",
      properties: {
        id: { type: "string" },
        name: { type: "string", examples: ["Ayla Berg"] },
        initials: { type: "string", examples: ["AB"] },
      },
    },
    commentCount: { type: "integer" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

const COMMENT_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    storyId: { type: "integer" },
    ref: { type: "string", examples: ["PPP-104"] },
    body: { type: "string" },
    author: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        initials: { type: "string" },
        role: { type: "string", enum: ["client", "admin"] },
      },
    },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const NOTIFICATION_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    storyId: { type: ["integer", "null"] },
    ref: {
      type: ["string", "null"],
      description: "Null once the ticket it referred to has been withdrawn.",
    },
    text: { type: "string" },
    read: { type: "boolean" },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const storyIdParam = {
  name: "id",
  in: "path",
  required: true,
  description: "The numeric story id — `4`, not `PPP-104`.",
  schema: { type: "integer", minimum: 1 },
} as const;

const storyResponse = (description: string, extra: Record<string, unknown> = {}) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { story: { $ref: "#/components/schemas/Story" }, ...extra },
      },
    },
  },
});

export async function buildOpenApiDocument() {
  const baseURL = process.env.APP_URL ?? "http://localhost:3000";

  return {
    openapi: "3.1.0",
    info: {
      title: "Pretty Please Print",
      version: process.env.PPP_TAG ?? "0.1.0",
      description:
        "The HTTP surface of one office's 3D-print queue.\n\n" +
        "**Everything except `/api/health` needs a name.** There is no " +
        "sign-in: pick your name on `/hello` and the browser holds a " +
        `\`${WHO_COOKIE}\` cookie saying who you are — Try it out below just ` +
        "works. The printer owner's endpoints need the " +
        `\`${OWNER_COOKIE}\` cookie instead, which \`/owner\` sets once the ` +
        "owner password is entered. From a script, copy the cookie out of a " +
        "browser.\n\n" +
        "**Scope.** A client sees their own requests; the printer owner sees " +
        "every one. Asking for a ticket outside your scope is answered `404`, " +
        "not `403` — a `403` would confirm it exists. Being refused an " +
        "*action* is `403`, because these endpoints are listed on this page " +
        "and pretending they are missing would help nobody.",
      license: { name: "AGPL-3.0-or-later", identifier: "AGPL-3.0-or-later" },
    },
    servers: [{ url: baseURL, description: "This deployment." }],

    tags: [
      { name: "stories", description: "Print requests — the tickets on the board." },
      { name: "queue", description: "The printer owner's actions on a ticket." },
      { name: "conversation", description: "The thread that lives on a ticket." },
      { name: "activity", description: "Your notifications." },
      { name: "files", description: "Uploading or importing a model, and fetching its bytes." },
      { name: "service", description: "Liveness, and this document." },
    ],

    components: {
      securitySchemes: {
        whoCookie: {
          type: "apiKey",
          in: "cookie",
          name: WHO_COOKIE,
          description:
            "The name picked on /hello. HttpOnly, so a browser sends it for " +
            "you and no script can read it — including this page's.",
        },
        ownerCookie: {
          type: "apiKey",
          in: "cookie",
          name: OWNER_COOKIE,
          description: "Set by /owner once the owner password is entered.",
        },
      },
      schemas: {
        Error: ERROR,
        Story: STORY_SCHEMA,
        Comment: COMMENT_SCHEMA,
        Notification: NOTIFICATION_SCHEMA,
        // Derived from the Zod schemas the handlers actually validate with.
        Wish: jsonSchema(WishSchema),
        FlagReason: jsonSchema(z.object({ reason: ReasonSchema })),
        CommentBody: jsonSchema(z.object({ body: BodySchema })),
      },
    },

    // Applies to every operation. `/api/health` overrides it with `security: []`.
    security: [{ whoCookie: [] }, { ownerCookie: [] }],

    paths: {
      "/api/health": {
        get: {
          tags: ["service"],
          summary: "Can the app serve?",
          description:
            "Deliberately terse, and the only endpoint reachable without a " +
            "name: it says whether the app can serve, never what it " +
            "connects to or why a check failed.",
          security: [],
          responses: {
            "200": {
              description: "It can.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { ok: { type: "boolean", const: true } },
                  },
                },
              },
            },
            "503": {
              description: "It cannot — the database did not answer.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { ok: { type: "boolean", const: false } },
                  },
                },
              },
            },
          },
        },
      },

      "/api/openapi.json": {
        get: {
          tags: ["service"],
          summary: "This document",
          description:
            "Needs a name, like everything else. It describes the " +
            "app to the people already using it.",
          responses: {
            "200": { description: "The OpenAPI 3.1 document." },
            ...COMMON_ERRORS,
          },
        },
      },

      "/api/stories": {
        get: {
          tags: ["stories"],
          summary: "List tickets",
          description:
            "Newest first. A client sees their own; the printer owner sees " +
            "every one. The filters can only narrow that set — none of them " +
            "can widen it.\n\n" +
            "Paging is a cursor, not an offset: pass the `nextCursor` from " +
            "the previous page as `before`. A row inserted mid-page therefore " +
            "cannot make one repeat or vanish.",
          parameters: [
            {
              name: "status",
              in: "query",
              description:
                "Repeat the parameter, or separate with commas. Omit for every status.",
              schema: { type: "array", items: { type: "string", enum: [...FLOW, "Declined"] } },
              explode: true,
            },
            { name: "flagged", in: "query", schema: { type: "boolean" } },
            {
              name: "mine",
              in: "query",
              description:
                "Only your own requests. Changes nothing for a client, whose " +
                "scope is already that; narrows the printer owner to theirs.",
              schema: { type: "boolean" },
            },
            {
              name: "uploader",
              in: "query",
              description:
                "Only tickets uploaded by these people, by user id (the `uploader.id` " +
                "of a ticket). Repeat the parameter, or separate with commas. For the " +
                "printer owner this is how to list what particular people have sent. " +
                "For a client it can only return their own tickets or nothing.",
              schema: { type: "array", items: { type: "string" }, maxItems: 50 },
              explode: true,
            },
            {
              name: "limit",
              in: "query",
              schema: {
                type: "integer",
                minimum: 1,
                maximum: LIST_LIMIT_MAX,
                default: LIST_LIMIT_DEFAULT,
              },
            },
            {
              name: "before",
              in: "query",
              description: "The `nextCursor` from the previous page.",
              schema: { type: "integer", minimum: 1 },
            },
          ],
          responses: {
            "200": {
              description: "A page of tickets.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      stories: { type: "array", items: { $ref: "#/components/schemas/Story" } },
                      nextCursor: {
                        type: ["integer", "null"],
                        description: "Null on the last page.",
                      },
                    },
                  },
                },
              },
            },
            "400": errorResponse("A filter did not parse."),
            ...COMMON_ERRORS,
          },
        },
      },

      "/api/stories/{id}": {
        get: {
          tags: ["stories"],
          summary: "One ticket",
          parameters: [storyIdParam],
          responses: {
            "200": {
              description: "The ticket.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Story" } },
              },
            },
            "404": errorResponse("No such ticket — or not one you may see. The two are indistinguishable on purpose."),
            ...COMMON_ERRORS,
          },
        },
        delete: {
          tags: ["stories"],
          summary: "Withdraw your own request",
          description:
            "Only the person who asked for it, and only while nobody has " +
            "acted on it — `Requested` or `Declined`. Past that the printer " +
            "owner has committed time, filament and bed space, and a ticket " +
            "vanishing from under them is not the requester's call to make.\n\n" +
            "The stored model goes with it, along with the conversation and " +
            "the notifications. The audit row stays.",
          parameters: [storyIdParam],
          responses: {
            "200": {
              description: "Withdrawn.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      withdrawn: { type: "boolean", const: true },
                      id: { type: "integer" },
                      ref: { type: "string" },
                      wasStatus: { type: "string" },
                    },
                  },
                },
              },
            },
            "403": errorResponse("Yours to see, but not yours to withdraw."),
            "404": errorResponse("No such ticket, or not one you may see."),
            "409": errorResponse("Already being worked on. Ask the printer owner."),
            ...COMMON_ERRORS,
          },
        },
      },

      "/api/stories/{id}/advance": {
        post: {
          tags: ["queue"],
          summary: "Move a ticket one step along",
          description:
            "Requested → Accepted → Printing → Delivery → Done, forwards, one " +
            "step at a time.\n\n" +
            "There is deliberately no endpoint that sets the status to a value " +
            "you choose: the next state is derived from the current one, so a " +
            "caller cannot skip a step. The body is ignored.",
          parameters: [storyIdParam],
          responses: {
            "200": storyResponse("Moved, and the uploader was told.", {
              moved: {
                type: "object",
                properties: { from: { type: "string" }, to: { type: "string" } },
              },
              notified: { type: "string", description: "Who was told." },
            }),
            "403": errorResponse("Only the printer owner moves a story along."),
            "404": errorResponse("No such ticket."),
            "409": errorResponse("Already at the end of the line."),
            ...COMMON_ERRORS,
          },
        },
      },

      "/api/stories/{id}/decline": {
        post: {
          tags: ["queue"],
          summary: "Decline a request",
          description:
            "Terminal, and reachable only from `Requested`. Once the printer " +
            "owner has said yes, saying no is a conversation rather than a " +
            "state change.",
          parameters: [storyIdParam],
          responses: {
            "200": storyResponse("Declined, and the uploader was told.", {
              moved: {
                type: "object",
                properties: { from: { type: "string" }, to: { type: "string" } },
              },
              notified: { type: "string" },
            }),
            "403": errorResponse("Not the printer owner, or past the point where declining is honest."),
            "404": errorResponse("No such ticket."),
            ...COMMON_ERRORS,
          },
        },
      },

      "/api/stories/{id}/flag": {
        post: {
          tags: ["queue"],
          summary: "Flag a model problem",
          description:
            "Does **not** change the status. The ticket stays where it is and " +
            "carries a note saying why it cannot proceed as-is. The reason is " +
            "required — a flag with no explanation tells the person waiting " +
            "nothing they can act on.",
          parameters: [storyIdParam],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FlagReason" },
                example: { reason: "The walls are 0.3 mm — it will not survive the bed." },
              },
            },
          },
          responses: {
            "200": storyResponse("Flagged, and the uploader was told.", {
              reason: { type: "string" },
              notified: { type: "string" },
            }),
            "400": errorResponse("No reason, or one too short to be useful."),
            "403": errorResponse("Only the printer owner flags a model."),
            "404": errorResponse("No such ticket."),
            ...COMMON_ERRORS,
          },
        },
        delete: {
          tags: ["queue"],
          summary: "Clear a flag",
          description:
            "The way off. A flag with no way off is a dead end — the ticket " +
            "would carry \"needs a look\" long after the model was fixed.",
          parameters: [storyIdParam],
          responses: {
            "200": storyResponse("Cleared, and the uploader was told.", {
              notified: { type: "string" },
            }),
            "403": errorResponse("Only the printer owner clears a flag."),
            "404": errorResponse("No such ticket."),
            "409": errorResponse("That ticket is not flagged."),
            ...COMMON_ERRORS,
          },
        },
      },

      "/api/stories/{id}/priority": {
        post: {
          tags: ["stories"],
          summary: "Set a ticket's priority",
          description:
            "The requester on their own ticket, or the printer owner on any. " +
            "Unlike the status, priority is set rather than derived: there is no " +
            "order to skip a step of. Refused once the ticket is Done or Declined.",
          parameters: [storyIdParam],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["priority"],
                  properties: { priority: { type: "string", enum: [...STORY_PRIORITIES] } },
                },
                example: { priority: "high" },
              },
            },
          },
          responses: {
            "200": storyResponse("The ticket, with its priority as it now stands.", {
              changed: {
                type: "object",
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                  unchanged: { type: "boolean" },
                },
              },
            }),
            "400": errorResponse("Not one of low, medium, high."),
            "404": errorResponse("No such ticket, or not one you may see."),
            "409": errorResponse("The ticket is Done or Declined."),
            ...COMMON_ERRORS,
          },
        },
      },

      "/api/stories/{id}/requeue": {
        post: {
          tags: ["stories"],
          summary: "Print one of your tickets again",
          description:
            "Opens a fresh `Requested` ticket from the same file — nothing is " +
            "uploaded. The body is the wish and **every field is optional**: " +
            "what is left out is carried over from the old ticket, so `{}` " +
            "repeats it exactly. What is sent is held to the rules an upload " +
            "is — the material and colour must be in `GET /api/catalog` today, " +
            "and the tip must be a benefit on offer. The old ticket is not changed.",
          parameters: [storyIdParam],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Wish" },
                example: { quantity: 4, material: "PETG", colorName: "Slate", printSettings: "40% infill" },
              },
            },
          },
          responses: {
            "201": storyResponse("The new ticket.", {
              from: { type: "string", examples: ["PPP-104"] },
            }),
            "400": errorResponse("A field did not parse."),
            "403": errorResponse("Only the person who asked for it can print it again."),
            "404": errorResponse("No such ticket, or not one you may see."),
            "409": errorResponse("The material, colour or benefit is not on offer any more."),
            ...COMMON_ERRORS,
          },
        },
      },

      "/api/stories/{id}/comments": {
        get: {
          tags: ["conversation"],
          summary: "Read the thread",
          description: "Oldest first, the way the ticket page reads.",
          parameters: [storyIdParam],
          responses: {
            "200": {
              description: "The thread.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      comments: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Comment" },
                      },
                    },
                  },
                },
              },
            },
            "404": errorResponse("No such ticket, or not one you may see."),
            ...COMMON_ERRORS,
          },
        },
        post: {
          tags: ["conversation"],
          summary: "Say something",
          description:
            "Both sides may write. The notification goes to the *other* side — " +
            "nobody needs telling about their own comment.",
          parameters: [storyIdParam],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CommentBody" },
                example: { body: "Could you do it in teal?" },
              },
            },
          },
          responses: {
            "201": {
              description: "Posted.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Comment" } },
              },
            },
            "400": errorResponse("Empty, or longer than a comment wants to be."),
            "404": errorResponse("No such ticket, or not one you may see."),
            ...COMMON_ERRORS,
          },
        },
      },

      "/api/catalog": {
        get: {
          tags: ["stories"],
          summary: "What can be asked for right now",
          description:
            "The materials on the shelf and the colours each comes in, in the " +
            "printer owner's order. `POST /api/upload` accepts exactly these " +
            "pairs and checks again when the upload arrives, so a pair that was " +
            "retired in between is refused with 400. Retired entries are not listed.",
          responses: {
            "200": {
              description: "Only materials that have at least one colour on offer.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      importSources: {
                        type: "array",
                        items: { type: "string", enum: [...IMPORT_SOURCES] },
                        description:
                          "The sites this instance imports models from — see " +
                          "`POST /api/import`. Empty when importing is not switched on.",
                      },
                      materials: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string", examples: ["PETG"] },
                            colors: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  name: { type: "string", examples: ["Slate"] },
                                  hex: { type: "string", examples: ["#4a5d78"] },
                                  style: { type: "string", examples: ["#4a5d78"] },
                                  mode: { type: "string", enum: [...COLOR_MODES] },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            ...COMMON_ERRORS,
          },
        },
      },

      "/api/notifications": {
        get: {
          tags: ["activity"],
          summary: "Your Activity feed",
          description:
            "Yours and only yours — there is no parameter naming a recipient, " +
            "because your name cookie already does.",
          parameters: [
            { name: "unread", in: "query", schema: { type: "boolean" } },
            {
              name: "limit",
              in: "query",
              schema: {
                type: "integer",
                minimum: 1,
                maximum: NOTIFICATION_LIMIT_MAX,
                default: 25,
              },
            },
          ],
          responses: {
            "200": {
              description: "Newest first, with the count the header badge shows.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      notifications: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Notification" },
                      },
                      unread: { type: "integer" },
                    },
                  },
                },
              },
            },
            "400": errorResponse("A filter did not parse."),
            ...COMMON_ERRORS,
          },
        },
      },

      "/api/notifications/read": {
        post: {
          tags: ["activity"],
          summary: "Mark read",
          description:
            "One notification with `{ \"id\": \"…\" }`, or the whole feed with " +
            "an empty body.\n\n" +
            "Somebody else's id is a no-op rather than a 404 — a 404 here " +
            "would be an oracle for whose notification is whose.",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                      description: "Leave it out to mark everything read.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "How many rows changed, and what is left unread.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      changed: { type: "integer" },
                      unread: { type: "integer" },
                    },
                  },
                },
              },
            },
            "400": errorResponse("`id` was present but not a string."),
            ...COMMON_ERRORS,
          },
        },
      },

      "/api/upload": {
        post: {
          tags: ["files"],
          summary: "Upload a model and open a request",
          description:
            `Multipart, because it carries up to ${formatBytes(MAX_BYTES)} of ` +
            `geometry. ${ACCEPTED_EXTENSIONS.join(" and ")} only, and the ` +
            "decision is made on the **bytes**, not the filename — an STL " +
            "renamed `.3mf` is refused, and so is anything that is neither.\n\n" +
            "Order matters: nothing reaches storage until the file has been " +
            "inspected, and no ticket exists until the object is in place. A " +
            "refused upload therefore leaves nothing behind.\n\n" +
            "The uploader is whoever the name cookie says. A `uploaderId` or `status` " +
            "in the body is ignored — every new ticket starts `Requested`.",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/Wish" },
                    {
                      type: "object",
                      required: ["file"],
                      properties: {
                        file: {
                          type: "string",
                          format: "binary",
                          description: `The model. At most ${formatBytes(MAX_BYTES)}.`,
                        },
                      },
                    },
                  ],
                },
                encoding: { file: { contentType: "application/octet-stream" } },
              },
            },
          },
          responses: {
            "200": {
              description: "Stored, and the printer owner was told.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      ref: { type: "string", examples: ["PPP-104"] },
                      title: { type: "string" },
                      dims: { type: ["string", "null"] },
                    },
                  },
                },
              },
            },
            "400": errorResponse("No file attached, a malformed body, or a field the catalogue does not allow."),
            "413": errorResponse("Larger than the cap."),
            "422": errorResponse("The bytes are not an acceptable model. The reason says which check failed."),
            "502": errorResponse("The file could not be written to disk. Nothing was saved."),
            ...COMMON_ERRORS,
          },
        },
      },

      "/api/import/files": {
        post: {
          tags: ["files"],
          summary: "List what a link to a model offers",
          description:
            "The first of two steps in importing a model from the site it is " +
            "published on, instead of downloading it and uploading it here. " +
            "Give it the link to the model's page and it answers with the " +
            "model and the `.stl` and `.3mf` files in it. A model usually " +
            "carries several and a ticket holds one, so pick one and send its " +
            "`id` to `POST /api/import`.\n\n" +
            "**Off unless the instance switches it on.** `GET /api/catalog` " +
            "lists the sites in `importSources`; where that is empty this " +
            "answers `501`.\n\n" +
            "The link is read for a model id and nothing else. The server " +
            "does not fetch the address it was given.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: {
                    url: {
                      type: "string",
                      description: "The model's page.",
                      examples: ["https://www.printables.com/model/3161-3d-benchy"],
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "The model, and its printable files in the site's order.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      source: { type: "string", enum: [...IMPORT_SOURCES] },
                      model: {
                        type: "object",
                        properties: {
                          id: { type: "string", examples: ["3161"] },
                          name: { type: "string", examples: ["3D BENCHY"] },
                          url: {
                            type: "string",
                            format: "uri",
                            description: "The model's page, as the ticket will record it.",
                          },
                          author: { type: ["string", "null"] },
                          license: { type: ["string", "null"] },
                        },
                      },
                      files: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string", examples: ["49068"] },
                            name: { type: "string", examples: ["3dbenchy.stl"] },
                            size: { type: "integer", description: "Bytes, as the site lists it." },
                            tooLarge: {
                              type: "boolean",
                              description: `Over ${formatBytes(MAX_BYTES)}, so it cannot be imported.`,
                            },
                          },
                        },
                      },
                      otherFiles: {
                        type: "integer",
                        description: "How many files the model carries that are neither `.stl` nor `.3mf`.",
                      },
                    },
                  },
                },
              },
            },
            "400": errorResponse("The body is not a JSON object."),
            "403": errorResponse("A cross-origin request."),
            "404": errorResponse("The site has no model at that link."),
            "422": errorResponse("Not a link to a model on a site this instance imports from."),
            "501": errorResponse("Importing is not switched on for this instance."),
            "502": errorResponse(
              "The site could not be reached, or answered in a way this app does not " +
                "recognise. Its API is not a published one and can change.",
            ),
            ...COMMON_ERRORS,
          },
        },
      },

      "/api/import": {
        post: {
          tags: ["files"],
          summary: "Import a model from a link and open a request",
          description:
            "`POST /api/upload` without the upload: the server fetches one " +
            "file from the model's page and opens a ticket from it. The body " +
            "is the wish an upload carries, plus `url` and the `fileId` chosen " +
            "from `POST /api/import/files`.\n\n" +
            "From there it is an upload in every respect. The decision is made " +
            "on the **bytes** that arrive, not on what the site called them; " +
            "nothing reaches storage until they have been inspected, and no " +
            "ticket exists until the file is in place. The ticket records " +
            "where the model came from in `source`.\n\n" +
            "The wish is checked before anything is fetched. The file must be " +
            `at most ${formatBytes(MAX_BYTES)}, and is refused if it arrives ` +
            "larger than the site listed it.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/Wish" },
                    {
                      type: "object",
                      required: ["url", "fileId"],
                      properties: {
                        url: {
                          type: "string",
                          description: "The model's page.",
                          examples: ["https://www.printables.com/model/3161-3d-benchy"],
                        },
                        fileId: {
                          type: "string",
                          description: "One of the `files[].id` values listed for that model.",
                          examples: ["49068"],
                        },
                      },
                    },
                  ],
                },
                example: {
                  url: "https://www.printables.com/model/3161-3d-benchy",
                  fileId: "49068",
                  material: "PETG",
                  colorName: "Slate",
                  quantity: 1,
                  tip: "A beer",
                },
              },
            },
          },
          responses: {
            "201": storyResponse("Fetched, stored, and the printer owner was told."),
            "400": errorResponse("A malformed body, no `fileId`, or a field the catalogue does not allow."),
            "403": errorResponse("A cross-origin request."),
            "404": errorResponse("The site has no model at that link, or that file is not one of its printable files."),
            "413": errorResponse("Larger than the cap."),
            "422": errorResponse(
              "Not a link to a model on a site this instance imports from — or the " +
                "bytes that arrived are not an acceptable model. The reason says which.",
            ),
            "501": errorResponse("Importing is not switched on for this instance."),
            "502": errorResponse(
              "The site could not be reached, would not hand the file over, pointed " +
                "somewhere this app does not fetch from, or sent more than it listed. " +
                "Nothing was saved.",
            ),
            "503": errorResponse("Too many models are being handled at once. Send it again in a moment."),
            ...COMMON_ERRORS,
          },
        },
      },

      "/api/models/{id}": {
        get: {
          tags: ["files"],
          summary: "Download the model",
          description:
            "The bytes, streamed by the app from its own disk. Model files " +
            "are not in the web root, so this route is the only way to them.\n\n" +
            "Scoped like the ticket: someone else's model is `404`. A download " +
            "by anyone other than the uploader is written to the audit trail.",
          parameters: [storyIdParam],
          responses: {
            "200": {
              description: "The file, as an attachment.",
              content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
            },
            "401": { description: "No name picked yet." },
            "404": { description: "No such ticket, or not one you may see." },
            "502": { description: "The file could not be read from disk." },
          },
        },
      },

    },
  };
}
