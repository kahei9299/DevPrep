/**
 * Generates a data-driven Marker validation harness for Java.
 *
 * The harness reads test data from /app/data.bin at runtime using a
 * length-prefixed format (netstrings): each field is encoded as
 * "<byte-length>:<utf8-bytes>". This preserves embedded newlines,
 * carriage returns, tabs, quotes, and trailing whitespace exactly.
 *
 * The compiled Main.class is reusable across requests for the same problem
 * because it depends only on (functionName, params, outputType, interactive)
 * — not on specific test data.
 */

import { type Param } from '$lib/utils/util'
import { javaHelperMethods, getDisplayFuncName } from '$lib/utils/javaUtil'

/** Monotonically increasing version. Bump when the generated harness Java
 *  source changes in a way that invalidates previously compiled Main.class. */
export const HARNESS_VERSION = 2

export function generateDataDrivenHarness(
  functionName: string,
  params: Param[],
  outputType: string,
  interactive: { secretField: string } | null
): string {
  const toFunc = `to_${outputType}`
  const displayFunc = getDisplayFuncName(outputType)

  const paramReads = params.map((_, i) =>
    `String p${i}Raw = readField(buf, pos);`
  ).join('\n            ')

  const paramExprs = params.map((p, i) =>
    convertParam(p, `p${i}Raw`)
  ).join(', ')

  let body: string
  if (interactive) {
    body = `
            try {
                System.out.println(marker.isCorrect(${paramExprs}, ${toFunc}(userOut)));
            } catch (Exception __e) {
                System.out.println("false");
            }
            String secretVal = readField(buf, pos);
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
    import java.nio.charset.StandardCharsets;
    public class Main {
        ${javaHelperMethods}

        // Netstring reader: "<length>:<bytes>"
        static int[] pos = {0};
        static String readField(byte[] buf, int[] pos) {
            int i = pos[0];
            if (i >= buf.length) throw new RuntimeException("Truncated data at offset " + i);
            int colonIdx = -1;
            for (int j = i; j < buf.length; j++) {
                if (buf[j] == (byte)':') { colonIdx = j; break; }
                if (buf[j] < '0' || buf[j] > '9')
                    throw new RuntimeException("Malformed length at offset " + i + ": byte " + buf[j]);
            }
            if (colonIdx < 0) throw new RuntimeException("Missing colon at offset " + i);
            int len = Integer.parseInt(new String(buf, i, colonIdx - i, StandardCharsets.US_ASCII));
            int start = colonIdx + 1;
            if (start + len > buf.length)
                throw new RuntimeException("Field overflows data: need " + len + " bytes at offset " + start + ", have " + (buf.length - start));
            String val = new String(buf, start, len, StandardCharsets.UTF_8);
            pos[0] = start + len;
            return val;
        }

        public static void main(String[] args) throws Exception {
            byte[] buf = Files.readAllBytes(Paths.get("/app/data.bin"));
            int numTests = Integer.parseInt(readField(buf, pos));
            Marker marker = new Marker();
            for (int __t = 0; __t < numTests; __t++) {
                ${paramReads}
                String userOut = readField(buf, pos);
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
 * Encode a string value as a netstring field: "<byte-length>:<utf8-bytes>"
 */
function encodeField(value: string): Buffer {
  const valBuf = Buffer.from(value, 'utf-8')
  const lenStr = String(valBuf.length)
  const header = Buffer.from(lenStr + ':', 'ascii')
  return Buffer.concat([header, valBuf])
}

/**
 * Generate the data.bin content (netstring-encoded) for a set of test cases.
 */
export function generateMarkerDataFile(
  params: Param[],
  testCases: any[],
  outputs: string[],
  interactive: { secretField: string } | null
): Buffer {
  const parts: Buffer[] = [encodeField(String(testCases.length))]
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i]
    for (const param of params) {
      const val = tc[param.name]
      let str: string
      if (typeof val === 'string') str = val
      else if (val === null || val === undefined) str = ''
      else str = JSON.stringify(val)
      parts.push(encodeField(str))
    }
    parts.push(encodeField(outputs[i] ?? ''))
    if (interactive) {
      parts.push(encodeField(String(tc[interactive.secretField] ?? '')))
    }
  }
  return Buffer.concat(parts)
}

/**
 * Compute the harness signature for cache key construction.
 * Includes HARNESS_VERSION so that a code change to the generated
 * Main.java invalidates all previously compiled Main.class files.
 */
export function computeHarnessSignature(
  functionName: string,
  params: Param[],
  outputType: string,
  interactive: { secretField: string } | null
): string {
  return JSON.stringify({
    v: HARNESS_VERSION,
    functionName,
    params: params.map(p => ({ name: p.name, type: p.type })),
    outputType,
    interactive: interactive?.secretField ?? null
  })
}
