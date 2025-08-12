export const config = { runtime: 'edge' };

function schema() {
  return {
    name: "RequirementsBundle",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        userStories: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id","as_a","i_want","so_that","acceptance_criteria"],
            properties: {
              id: { type: "string" },
              as_a: { type: "string" },
              i_want: { type: "string" },
              so_that: { type: "string" },
              acceptance_criteria: { type: "array", items: { type: "string" } },
              trace: {
                type: "object",
                additionalProperties: false,
                properties: {
                  ui_nodes: { type: "array", items: { type: "string" } },
                  entities: { type: "array", items: { type: "string" } }
                }
              }
            }
          }
        },
        declarativeStories: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title","scenarios"],
            properties: {
              title: { type: "string" },
              scenarios: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["given","when","then"],
                  properties: {
                    given: { type: "string" },
                    when: { type: "string" },
                    then: { type: "string" },
                    examples: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {} // free-form rows not allowed in strict mode; expand keys if you know them
                      }
                    }
                  }
                }
              }
            }
          }
        },
        imperativeTests: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name","gherkin","tags"],
            properties: {
              name: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              gherkin: { type: "string" },
              selectors: {
                type: "object",
                additionalProperties: false,
                properties: {} // add exact selector keys if you want them enforced
              }
            }
          }
        },
        uiDataModel: {
          type: "object",
          additionalProperties: false,
          properties: {
            entities: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name","fields"],
                properties: {
                  name: { type: "string" },
                  fields: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["name","type"],
                      properties: {
                        name: { type: "string" },
                        type: { type: "string" },
                        required: { type: "boolean" },
                        constraints: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            minLength: { type: "number" },
                            maxLength: { type: "number" },
                            pattern: { type: "string" },
                            minimum: { type: "number" },
                            maximum: { type: "number" }
                          }
                        },
                        enum: { type: "array", items: { type: "string" } }
                      }
                    }
                  },
                  relations: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        type: { type: "string" },   // e.g., one-to-many
                        target: { type: "string" }, // entity name
                        on: { type: "string" }      // join field
                      }
                    }
                  }
                }
              }
            },
            jsonSchemas: {
              type: "object",
              additionalProperties: false,
              properties: {} // if you want arbitrary entity names here, consider moving them to a list instead of a map when strict=true
            },
            sqlDDL: { type: "string" }
          }
        },
        validationReport: {
          type: "object",
          additionalProperties: false,
          properties: {
            coverage: {
              type: "object",
              additionalProperties: false,
              properties: {
                uiComponentsCoveredPct: { type: "number" },
                fieldsWithTestsPct: { type: "number" }
              }
            },
            conflicts: { type: "array", items: { type: "string" } },
            ambiguities: { type: "array", items: { type: "string" } },
            missing: { type: "array", items: { type: "string" } },
            notes: { type: "array", items: { type: "string" } }
          }
        }
      },
      required: [
        "userStories",
        "declarativeStories",
        "imperativeTests",
        "uiDataModel",
        "validationReport"
      ]
    }
  };
}

export default async function handler(req) {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    const { figmaUrl, brief, rules, model, detail, imageDataUrl } = await req.json();

    const messages = [
      {
        role: "system",
        content:
`You are a Product Requirements generator.
Return STRICT JSON ONLY (no prose) that conforms to the provided JSON Schema.
Inputs you may use: Figma URL, uploaded image, product brief, and validation rules.
Goals:
1) User Stories with SMART acceptance criteria (success, error, empty, permission).
2) Declarative stories (rule-focused Gherkin; scenario outlines with examples where useful).
3) Imperative test cases (Given/When/Then; selectors/testIds where possible).
4) UI Data Model (entities, fields, constraints, relations, JSON Schemas, optional SQL DDL).
5) Validation Report (coverage, conflicts, ambiguities, missing).
Honor the rules strictly. If a detail is genuinely unknown, use "TBD" and flag it in validationReport.`
      },
      {
        role: "user",
        content: [
          { type: "text", text:
`FIGMA: ${figmaUrl || 'N/A'}
BRIEF: ${brief || 'N/A'}
DETAIL: ${detail || 'standard'}
RULES (YAML or text):
${rules || ''}

Please infer intents from UI labels and flows if present. Produce comprehensive but concise artifacts.
Link stories/tests/model via trace where obvious.` }
        ]
      }
    ];

    // If an image was uploaded, include it. Models with vision accept data URLs. (See "Images & vision" docs.)
    if (imageDataUrl) {
  messages[1].content.push({
    type: "image_url",
    image_url: { url: imageDataUrl /*, detail: "high" */ }
  });
}

    // Call OpenAI Chat Completions with Structured Outputs (JSON Schema)
    // API reference: Chat + Structured Outputs. Models doc lists GPT-5 family.
    // https://platform.openai.com/ (docs cited below)
    const body = {
  model: model || "gpt-5",
  messages,
  // Remove temperature or comment it out
  response_format: { type: "json_schema", json_schema: schema() }
};

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(`OpenAI error: ${text}`, { status: 500 });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    return new Response(content, { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(`Server error: ${err.message || String(err)}`, { status: 500 });
  }
}
