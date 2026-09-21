import Prism from 'prismjs'

// Prism components check (window.Prism || global.Prism)
if (typeof globalThis !== 'undefined') {
  ;(globalThis as unknown as { Prism: typeof Prism }).Prism = Prism
}

// Import languages in dependency order
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-sql'

// In diffs, strings may span across hunks, lines, or multiline formatting
const multilineString = /(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[\s\S])*?\1/
if (Prism.languages.javascript) {
  Prism.languages.javascript.string = multilineString
}
if (Prism.languages.typescript) {
  Prism.languages.typescript.string = multilineString
}

// Enhance CSS grammar for hex colors, CSS variables, and numeric units
if (Prism.languages.css) {
  Prism.languages.insertBefore('css', 'function', {
    variable: {
      pattern: /--[\w-]+/i
    },
    hexcode: {
      pattern: /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/i
    },
    unit: {
      pattern: /(?:\b\d+(?:\.\d+)?|\B\.\d+)(?:px|rem|em|vh|vw|pt|%|ms|s|deg|fr)?\b/i
    }
  })
}

export default Prism
