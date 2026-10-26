import type { MessageLeaf, MessageOp, MessageTree, NodeRange, Plugin, TextRange } from '@x18n/core'
import type { Expression, Node, ObjectExpression, ObjectPropertyKind, Program } from 'oxc-parser'
import type { LiteralItem, LiteralObject, LiteralSyntax } from '../shared/literal'
import { applyMessageOps, diffText, errors, pathId } from '@x18n/core'
import { parseSync } from 'oxc-parser'
import { indentUnit } from '../shared'
import { editLiteral, literalText } from '../shared/literal'

interface Module {
  readonly tree: MessageTree
  readonly ranges: Map<string, NodeRange>
  readonly literal: LiteralObject | undefined
}

type Fail = (code: 'X18N2003' | 'X18N2004', node: Node, reason: string) => never

/** Type-only wrappers, `defineX({ ... })` helpers that return their argument, and loaders that only return an object (`defineI18nLocale(() => ({ ... }))`). */
function unwrap(node: Expression): Expression {
  if (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression' || node.type === 'TSTypeAssertion' || node.type === 'TSNonNullExpression' || node.type === 'ParenthesizedExpression')
    return unwrap(node.expression)
  if (node.type === 'ArrowFunctionExpression' && node.body.type !== 'BlockStatement')
    return unwrap(node.body)
  if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') && node.body?.type === 'BlockStatement') {
    const [only, ...rest] = node.body.body
    if (only?.type === 'ReturnStatement' && only.argument && rest.length === 0)
      return unwrap(only.argument)
  }
  const argument = node.type === 'CallExpression' && node.arguments.length === 1
    ? node.arguments[0]
    : undefined
  if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && /^define[A-Z]/.test(node.callee.name) && argument && argument.type !== 'SpreadElement')
    return unwrap(argument)
  return node
}

function findRoot(program: Program, fail: Fail): ObjectExpression | undefined {
  const bindings = new Map<string, Expression>()
  for (const statement of program.body) {
    if (statement.type !== 'VariableDeclaration')
      continue
    for (const declarator of statement.declarations) {
      if (declarator.id.type === 'Identifier' && declarator.init)
        bindings.set(declarator.id.name, declarator.init)
    }
  }
  let exported: Expression | undefined
  for (const statement of program.body) {
    if (statement.type === 'ExportDefaultDeclaration' && statement.declaration.type !== 'FunctionDeclaration' && statement.declaration.type !== 'ClassDeclaration' && statement.declaration.type !== 'TSInterfaceDeclaration')
      exported = statement.declaration
    else if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression' && isModuleExports(statement.expression.left))
      exported = statement.expression.right
    else if (statement.type === 'ExportDefaultDeclaration')
      fail('X18N2004', statement, 'the default export is not an object literal')
  }
  if (!exported) {
    return program.body.length === 0
      ? undefined
      : fail('X18N2004', program, 'no `export default { ... }` or `module.exports = { ... }`')
  }
  let root = unwrap(exported)
  if (root.type === 'Identifier' && bindings.has(root.name))
    root = unwrap(bindings.get(root.name)!)
  if (root.type === 'ObjectExpression')
    return root
  return fail(root.type === 'Literal' || root.type === 'ArrayExpression'
    ? 'X18N2003'
    : 'X18N2004', root, 'the default export is not an object literal')
}

function isModuleExports(node: Node): boolean {
  return node.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier' && node.object.name === 'module'
    && node.property.type === 'Identifier' && node.property.name === 'exports'
}

function readProperty(property: ObjectPropertyKind, fail: Fail): { key: string, range: TextRange, value: Expression } {
  if (property.type === 'SpreadElement' || property.kind !== 'init' || property.method || property.shorthand)
    return fail('X18N2004', property, 'only `key: value` properties are static')
  const { key, value } = property
  if (key.type === 'Identifier' && !property.computed) {
    return {
      key: key.name,
      range: { start: key.start, end: key.end },
      value: unwrap(value),
    }
  }
  if (key.type === 'Literal' && (typeof key.value === 'string' || typeof key.value === 'number')) {
    return {
      key: String(key.value),
      range: typeof key.value === 'string'
        ? { start: key.start + 1, end: key.end - 1 }
        : { start: key.start, end: key.end },
      value: unwrap(value),
    }
  }
  return fail('X18N2004', key, 'computed keys are not static')
}

function readLeaf(node: Expression, text: string): { value: MessageLeaf, quote: string | undefined } | undefined {
  if (node.type === 'Literal' && !('regex' in node) && typeof node.value !== 'bigint') {
    return {
      value: node.value,
      quote: typeof node.value === 'string'
        ? text[node.start]
        : undefined,
    }
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis[0]?.value.cooked != null)
    return { value: node.quasis[0].value.cooked, quote: '`' }
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number')
    return { value: -node.argument.value, quote: undefined }
  return undefined
}

function readObject(node: ObjectExpression, path: readonly string[], ranges: Map<string, NodeRange>, text: string, fail: Fail): { tree: MessageTree, literal: LiteralObject } {
  const tree: Record<string, MessageTree | MessageLeaf> = {}
  const items: LiteralItem[] = []
  for (const property of node.properties) {
    const { key, range, value } = readProperty(property, fail)
    const childPath = [...path, key]
    const item = {
      key,
      range: { start: property.start, end: property.end },
    }
    if (value.type === 'ObjectExpression') {
      ranges.set(pathId(childPath), {
        key: range,
        value: { start: value.start, end: value.end },
      })
      const child = readObject(value, childPath, ranges, text, fail)
      tree[key] = child.tree
      items.push({ ...item, value: child.literal })
      continue
    }
    const leaf = readLeaf(value, text)
    if (!leaf)
      return fail('X18N2004', value, `${value.type} is not a static value`)
    ranges.set(pathId(childPath), {
      key: range,
      value: leaf.quote === undefined
        ? { start: value.start, end: value.end }
        : { start: value.start + 1, end: value.end - 1 },
    })
    tree[key] = leaf.value
    items.push({
      ...item,
      value: {
        kind: 'scalar',
        range: { start: value.start, end: value.end },
        quote: leaf.quote,
      },
    })
  }
  return {
    tree,
    literal: {
      kind: 'object',
      range: { start: node.start, end: node.end },
      items,
    },
  }
}

function readModule(text: string, path: string): Module {
  const fail: Fail = (code, node, reason) => {
    throw errors[code]({ path, line: text.slice(0, node.start).split('\n').length, reason })
  }
  const result = parseSync(path, text, {
    lang: /\.[mc]?ts$/.test(path)
      ? 'ts'
      : 'js',
    sourceType: 'module',
  })
  if (result.errors.length > 0)
    throw errors.X18N2002({ path, reason: result.errors[0]!.message })
  const root = findRoot(result.program, fail)
  const ranges = new Map<string, NodeRange>()
  if (!root)
    return { tree: {}, ranges, literal: undefined }
  return {
    ...readObject(root, [], ranges, text, fail),
    ranges,
  }
}

const singleEncodings: Record<string, string> = {
  '\\': '\\\\',
  '\'': '\\\'',
  '\n': '\\n',
  '\r': '\\r',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

function literal(value: MessageLeaf, quote: string | undefined): string {
  if (typeof value !== 'string')
    return String(value)
  if (quote === '"')
    return JSON.stringify(value)
  if (quote === '`')
    return `\`${value.replace(/\\|`|\$\{/g, match => `\\${match}`)}\``
  return `'${value.replace(/[\\'\n\r\u2028\u2029]/g, char => singleEncodings[char]!)}'`
}

function syntaxOf(text: string, indent: number | 'tab' | undefined): LiteralSyntax {
  return {
    open: '{',
    close: '}',
    separator: ': ',
    key: key => /^[a-z_$][\w$]*$/i.test(key)
      ? key
      : literal(key, '\''),
    leaf: (value, quote) => literal(value, quote ?? '\''),
    unit: indentUnit(text, indent, '  '),
    trailingComma: true,
  }
}

function moduleText(tree: MessageTree, path: string, syntax: LiteralSyntax): string {
  return `${path.endsWith('.cjs')
    ? 'module.exports ='
    : 'export default'} ${literalText(tree, syntax)}\n`
}

function applyOp(text: string, op: MessageOp, path: string, syntax: LiteralSyntax): string {
  const root = readModule(text, path).literal
  return root
    ? editLiteral(text, root, op, syntax)
    : moduleText(applyMessageOps({}, [op]), path, syntax)
}

export function ecmascript(): Plugin {
  return {
    name: 'x18n:format-js',
    formats: [
      {
        id: 'js',
        extensions: ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'],
        parse(text, ctx) {
          const { tree, ranges } = readModule(text, ctx.path)
          return { tree, ranges }
        },
        edit(text, ops, ctx) {
          const syntax = syntaxOf(text, ctx.indent)
          let next = text
          for (const op of ops)
            next = applyOp(next, op, ctx.path, syntax)
          return diffText(text, next)
        },
        serialize: (tree, ctx) => moduleText(tree, ctx.path, syntaxOf('', ctx.indent)),
      },
    ],
  }
}

export default ecmascript
