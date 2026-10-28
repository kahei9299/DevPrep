/**
 * Generates a data-driven Marker validation harness for Java.
 *
 * Unlike the original approach that embeds test data as Java source literals
 * (requiring recompilation per request), this harness reads test data from
 * /app/data.txt at runtime. The compiled Main.class can be reused across
 * requests for the same problem, eliminating the ~2.5-3s javac overhead.
 *
 * Data file format: one value per line. For each test case:
 *   - One line per parameter (string representation)
 *   - One line for the user's output
 *   - A line containing "---" as separator
 *
 * The harness is specific to a problem's (functionName, params, outputType,
 * interactive) signature — NOT to specific test data.
 */

import { type Param } from '$lib/utils/util'
import { javaHelperMethods, getDisplayFuncName } from '$lib/utils/javaUtil'

export function generateDataDrivenHarness(
  functionName: string,
  params: Param[],
  outputType: string,
  interactive: { secretField: string } | null
): string {
  const toFunc = `to_${outputType}`
  const displayFunc = getDisplayFuncName(outputType)

  // Generate parameter reading code: each param is read as a line and converted
  const paramReads = params.map((p, i) => {
    const varName = `p${i}`
    return `String ${varName}Raw = lines.get(lineIdx++);`
  }).join('\n            ')

  // Generate the conversion expressions for isCorrect call
  const paramExprs = params.map((p, i) => {
    const varName = `p${i}Raw`
    return convertParam(p, varName)
  }).join(', ')

  // Generate the validation call
  let body: string
  if (interactive) {
    body = `
            try {
                System.out.println(marker.isCorrect(${paramExprs}, ${toFunc}(userOut)));
            } catch (Exception __e) {
                System.out.println("false");
            }
            // For interactive problems, display the secret field value
            String secretVal = lines.get(lineIdx++);
            System.out.println(${displayFunc}(secretVal));
            System.out.println("---");`
  } else {
    body = `
            try {
                System.out.println(marker.isCorrect(${paramExprs}, ${toFunc}(userOut)));
            } catch (Exception __e) {
                System.out.println("false");
            }
            System.out.println(${displayFunc}(marker.${functionName}(${paramExprs})));
            System.out.println("---");`
  }

  return `
    import java.util.*;
    import java.io.*;
    import java.nio.file.*;
    public class Main {
        ${javaHelperMethods}
        public static void main(String[] args) throws Exception {
            List<String> lines = Files.readAllLines(Paths.get("/app/data.txt"));
            int numTests = Integer.parseInt(lines.get(0).trim());
            int lineIdx = 1;
            Marker marker = new Marker();
            for (int __t = 0; __t < numTests; __t++) {
                ${paramReads}
                String userOut = lines.get(lineIdx++);
                ${body}
            }
        }
    }`
}

function convertParam(param: Param, rawVar: string): string {
  switch (param.type) {
    case 'string': return rawVar
    case 'int': return `Integer.parseInt(${rawVar}.trim())`
    case 'int_array': return `to_int_array(${rawVar})`
    case 'int_array_2d': return `to_int_array_2d(${rawVar})`
    case 'string_array': return `to_string_array(${rawVar})`
    case 'char_array_2d': return `to_char_array_2d(${rawVar})`
    case 'string_list_2d': return `to_string_list_2d(${rawVar})`
    default:
      if (param.type === 'list_node') return `to_list_node(${rawVar})`
      if (param.type === 'tree_node') return `to_tree_node(${rawVar})`
      if (param.type === 'graph_node') return `to_graph_node(${rawVar})`
      if (param.type === 'list_node_array') return `to_list_node_array(${rawVar})`
      return `to_${param.type}(${rawVar})`
  }
}

/**
 * Generate the data.txt content for a set of test cases.
 * This is the runtime data that changes per request.
 */
export function generateMarkerDataFile(
  params: Param[],
  testCases: any[],
  outputs: string[],
  interactive: { secretField: string } | null
): string {
  const lines: string[] = [String(testCases.length)]
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i]
    for (const param of params) {
      const val = tc[param.name]
      // Serialize the value as a string that the Java to_* functions can parse
      if (typeof val === 'string') {
        lines.push(val)
      } else if (val === null || val === undefined) {
        lines.push('')
      } else {
        lines.push(JSON.stringify(val))
      }
    }
    lines.push(outputs[i] ?? '')
    if (interactive) {
      lines.push(String(tc[interactive.secretField] ?? ''))
    }
  }
  return lines.join('\n') + '\n'
}

/**
 * Compute a signature hash that identifies the harness structure.
 * Two problems with the same (functionName, params, outputType, interactive)
 * produce the same signature — their Main.java and Marker.java are different
 * but the harness template is the same shape.
 *
 * The full cache key combines this signature with the Marker source hash.
 */
export function computeHarnessSignature(
  functionName: string,
  params: Param[],
  outputType: string,
  interactive: { secretField: string } | null
): string {
  return JSON.stringify({ functionName, params: params.map(p => ({ name: p.name, type: p.type })), outputType, interactive: interactive?.secretField ?? null })
}
