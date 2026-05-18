/**
 * Tests for the extractJSON utility added in this PR.
 * The function is not exported from route.ts, so we replicate it here
 * to test it as a pure function (same logic, same edge cases).
 */

/** Extract the first top-level JSON object from a string.
 *  Handles Claude responses that wrap the JSON in prose or markdown fences. */
function extractJSON(text: string): string {
  // Strip markdown fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()

  // Walk character by character to find the outermost { }
  let depth = 0
  let start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (text[i] === '}') {
      depth--
      if (depth === 0 && start !== -1) return text.slice(start, i + 1)
    }
  }
  // Fallback — return trimmed original and let JSON.parse throw a clear error
  return text.trim()
}

describe('extractJSON', () => {
  describe('plain JSON input', () => {
    it('returns the string unchanged when input is already valid JSON', () => {
      const input = '{"summary":"good","feedbackItems":[]}'
      expect(extractJSON(input)).toBe(input)
    })

    it('handles JSON with nested objects', () => {
      const input = '{"a":{"b":{"c":1}}}'
      const result = extractJSON(input)
      expect(JSON.parse(result)).toEqual({ a: { b: { c: 1 } } })
    })

    it('handles JSON with nested arrays containing objects', () => {
      const input = '{"items":[{"id":"1","val":2},{"id":"2","val":3}]}'
      const result = extractJSON(input)
      expect(JSON.parse(result)).toEqual({ items: [{ id: '1', val: 2 }, { id: '2', val: 3 }] })
    })
  })

  describe('prose wrapping', () => {
    it('extracts JSON preceded by prose text', () => {
      const input = 'Here is the analysis: {"summary":"ok","feedbackItems":[]}'
      const result = extractJSON(input)
      expect(JSON.parse(result)).toEqual({ summary: 'ok', feedbackItems: [] })
    })

    it('extracts JSON followed by prose text', () => {
      const input = '{"summary":"ok","feedbackItems":[]} Hope this helps!'
      const result = extractJSON(input)
      expect(JSON.parse(result)).toEqual({ summary: 'ok', feedbackItems: [] })
    })

    it('extracts JSON surrounded by prose on both sides', () => {
      const input = 'Here you go: {"summary":"great mix","feedbackItems":[{"id":"a","timestamp":null,"severity":"VALIDATION","observation":"good low end","feedback":"keep it","status":"pending"}]} End of response.'
      const result = extractJSON(input)
      const parsed = JSON.parse(result)
      expect(parsed.summary).toBe('great mix')
      expect(parsed.feedbackItems).toHaveLength(1)
    })
  })

  describe('markdown fence stripping', () => {
    it('strips ```json fences', () => {
      const input = '```json\n{"summary":"test","feedbackItems":[]}\n```'
      const result = extractJSON(input)
      expect(JSON.parse(result)).toEqual({ summary: 'test', feedbackItems: [] })
    })

    it('strips plain ``` fences (no language tag)', () => {
      const input = '```\n{"summary":"test","feedbackItems":[]}\n```'
      const result = extractJSON(input)
      expect(JSON.parse(result)).toEqual({ summary: 'test', feedbackItems: [] })
    })

    it('handles fenced JSON with surrounding prose', () => {
      const input = 'Sure, here is the result:\n```json\n{"summary":"mix","feedbackItems":[]}\n```\nLet me know if you have questions.'
      const result = extractJSON(input)
      expect(JSON.parse(result)).toEqual({ summary: 'mix', feedbackItems: [] })
    })

    it('handles fenced JSON with extra whitespace inside fences', () => {
      const input = '```json   \n  {"summary":"ok","feedbackItems":[]}  \n```'
      const result = extractJSON(input)
      expect(JSON.parse(result)).toEqual({ summary: 'ok', feedbackItems: [] })
    })

    it('is case-insensitive for the json language tag', () => {
      const input = '```JSON\n{"summary":"ok","feedbackItems":[]}\n```'
      const result = extractJSON(input)
      expect(JSON.parse(result)).toEqual({ summary: 'ok', feedbackItems: [] })
    })
  })

  describe('nested braces handling', () => {
    it('correctly handles deeply nested objects without prematurely closing', () => {
      const obj = {
        summary: 'test',
        feedbackItems: [
          {
            id: 'slug',
            timestamp: null,
            severity: 'CRITICAL',
            observation: 'obs {with braces}',
            feedback: 'fix {this}',
          },
        ],
      }
      const input = `Some text before. ${JSON.stringify(obj)} Some text after.`
      const result = extractJSON(input)
      expect(JSON.parse(result)).toEqual(obj)
    })
  })

  describe('fallback behaviour', () => {
    it('returns trimmed input when no braces are found at all', () => {
      const input = '  no json here  '
      expect(extractJSON(input)).toBe('no json here')
    })

    it('returns trimmed input when only an opening brace exists (unclosed)', () => {
      const input = '  { unclosed '
      // depth never hits 0 on }, so fallback returns trimmed original
      expect(extractJSON(input)).toBe('{ unclosed')
    })

    it('returns empty string for empty input', () => {
      expect(extractJSON('')).toBe('')
    })
  })

  describe('real-world Claude response shapes', () => {
    it('parses a realistic Claude response with trailing newline', () => {
      const raw = `{\n  "summary": "The mix is well-balanced.",\n  "feedbackItems": [\n    {\n      "id": "low-end-clarity",\n      "timestamp": 32,\n      "severity": "IMPORTANT",\n      "observation": "Muddy 200-400 Hz region",\n      "feedback": "Cut 3 dB at 300 Hz with a narrow Q"\n    }\n  ]\n}\n`
      const result = extractJSON(raw)
      const parsed = JSON.parse(result)
      expect(parsed.summary).toBe('The mix is well-balanced.')
      expect(parsed.feedbackItems[0].severity).toBe('IMPORTANT')
    })

    it('handles a response where JSON is embedded after a reasoning paragraph', () => {
      const raw = `I've analysed the track data carefully. Based on the measurements:\n\n{"summary":"Solid foundation.","feedbackItems":[{"id":"x","timestamp":null,"severity":"VALIDATION","observation":"Good stereo width","feedback":"Keep it"}]}`
      const result = extractJSON(raw)
      const parsed = JSON.parse(result)
      expect(parsed.feedbackItems[0].id).toBe('x')
    })
  })
})