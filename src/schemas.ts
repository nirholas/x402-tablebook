/**
 * Per-route request/response schemas published in the x402 402 challenge.
 *
 * The x402scan discovery audit reads `accepts[0].outputSchema.input` and
 * `accepts[0].outputSchema.output` from the *runtime* 402 body, and runtime
 * behaviour is authoritative — so these must not contradict openapi.json.
 * They are generated from `public/openapi.json` ($refs inlined) and keyed
 * exactly like the paywall route map, so they can be spread straight into a
 * route declaration.
 *
 * Regenerate after editing openapi.json rather than hand-editing.
 *
 * `input` follows the x402 Bazaar convention: `{ type: "http", method, ... }`
 * with `queryParams` for GET routes and `bodyType`/`bodyFields` for routes
 * that take a JSON body. `output` is the 200 response schema.
 */

export type RouteSchema = {
  outputSchema: {
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  };
};

export const ROUTE_SCHEMAS = {
  "GET /availability": {
    outputSchema: {
      input: {
        type: "http",
        method: "GET",
        queryParams: {
          date: {
            type: "string",
            format: "date"
          },
          party: {
            type: "integer",
            minimum: 1
          },
          days: {
            type: "integer",
            minimum: 1
          }
        }
      },
      output: {
        type: "object",
        properties: {
          restaurant: {
            type: "object"
          },
          slotMinutes: {
            type: "integer"
          },
          seatingMinutes: {
            type: "integer"
          },
          refundPolicy: {
            type: "object",
            properties: {
              holdPrice: {
                type: "string"
              },
              freeCancellationHours: {
                type: "number"
              },
              description: {
                type: "string"
              }
            }
          },
          generatedAt: {
            type: "string",
            format: "date-time"
          },
          slots: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: {
                  type: "string",
                  format: "date"
                },
                time: {
                  type: "string"
                },
                partySizes: {
                  type: "array",
                  items: {
                    type: "integer"
                  }
                },
                tableTypes: {
                  type: "array",
                  items: {
                    type: "string"
                  }
                },
                openTables: {
                  type: "integer"
                }
              }
            }
          }
        }
      },
    },
  },
  "POST /book": {
    outputSchema: {
      input: {
        type: "http",
        method: "POST",
        bodyType: "json",
        bodyFields: {
          date: {
            type: "string",
            format: "date"
          },
          time: {
            type: "string",
            example: "19:00"
          },
          party: {
            type: "integer",
            minimum: 1
          },
          name: {
            type: "string"
          },
          notes: {
            type: "string"
          },
          payerWallet: {
            type: "string"
          }
        },
        required: [
          "date",
          "time",
          "party",
          "name"
        ]
      },
      output: {
        type: "object",
        properties: {
          reservationId: {
            type: "string"
          },
          status: {
            type: "string",
            enum: [
              "confirmed"
            ]
          },
          restaurant: {
            type: "string"
          },
          confirmedTime: {
            type: "string"
          },
          party: {
            type: "integer"
          },
          name: {
            type: "string"
          },
          table: {
            type: "object",
            properties: {
              id: {
                type: "string"
              },
              name: {
                type: "string"
              },
              type: {
                type: "string"
              },
              seats: {
                type: "integer"
              }
            }
          },
          refundTerms: {
            type: "object",
            properties: {
              holdPrice: {
                type: "string"
              },
              freeCancellationHours: {
                type: "number"
              },
              description: {
                type: "string"
              }
            }
          },
          cancelToken: {
            type: "string"
          },
          cancelEndpoint: {
            type: "string"
          },
          ledgerEntry: {
            type: "object",
            properties: {
              entryId: {
                type: "string"
              },
              reservationId: {
                type: "string"
              },
              kind: {
                type: "string",
                enum: [
                  "hold",
                  "refund",
                  "forfeit"
                ]
              },
              amount: {
                type: "string"
              },
              wallet: {
                type: "string"
              },
              reason: {
                type: "string"
              },
              at: {
                type: "string",
                format: "date-time"
              }
            }
          },
          ics: {
            type: "string",
            description: "base64 RFC 5545 calendar invite"
          },
          signature: {
            type: "string"
          },
          createdAt: {
            type: "string",
            format: "date-time"
          }
        }
      },
    },
  },
} satisfies Record<string, RouteSchema>;
