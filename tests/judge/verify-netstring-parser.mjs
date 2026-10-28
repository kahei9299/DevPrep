#!/usr/bin/env node
/**
 * Java netstring parser integration test.
 *
 * Compiles and runs a minimal Java program inside Docker that exercises
 * the exact readField() parser from the generated Main.java harness.
 * Verifies that TypeScript encoding and Java decoding agree on edge cases.
 *
 * Requires: Docker running, alpine/java:22-jdk image available.
 *
 * Usage: node tests/judge/verify-netstring-parser.mjs
 */

import Dockerode from 'dockerode'
import tar from 'tar-stream'

const docker = new Dockerode()
const IMAGE = 'alpine/java:22-jdk'

// ─── TypeScript netstring encoder (same logic as production markerHarness.ts) ───

function encodeField(value) {
  const valBuf = Buffer.from(value, 'utf-8')
  const header = Buffer.from(String(valBuf.length) + ':', 'ascii')
  return Buffer.concat([header, valBuf])
}

// ─── Test cases ───

const TEST_CASES = [
  { name: 'simple ASCII', fields: ['hello', 'world'] },
  { name: 'empty string', fields: ['', 'nonempty', ''] },
  { name: 'embedded newlines', fields: ['line1\nline2', 'a\nb\nc'] },
  { name: 'carriage return + tab', fields: ['hello\r\n\tworld'] },
  { name: 'trailing whitespace', fields: ['value   ', '  leading'] },
  { name: 'unicode emoji', fields: ['🎉 party', '你好世界'] },
  { name: 'quotes and backslashes', fields: ['"quoted\\value"', "it's"] },
  { name: 'digits and colons', fields: ['42:ambiguous', '7:tricky', '0:'] },
  { name: 'JSON arrays', fields: ['[1,2,3]', '[[1,2],[3,4]]', '["a","b"]'] },
  { name: 'long string (10KB)', fields: ['x'.repeat(10000)] },
  { name: 'only colons', fields: [':::', ':'] },
  { name: 'null-like strings', fields: ['null', 'undefined', 'NaN'] },
  { name: 'single char', fields: ['a', 'z', '0', ':', '\n'] },
]

// Java program that decodes netstrings and outputs each field as hex
// (hex survives Docker demux without encoding issues)
const JAVA_SOURCE = `
import java.util.*;
import java.io.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;

public class NetstringTest {
    static int[] pos = {0};

    static String readField(byte[] buf, int[] pos) {
        int i = pos[0];
        if (i >= buf.length) throw new RuntimeException("Truncated data at offset " + i);
        int colonIdx = -1;
        for (int j = i; j < buf.length; j++) {
            if (buf[j] == (byte)':') { colonIdx = j; break; }
            if (buf[j] < '0' || buf[j] > '9')
                throw new RuntimeException("Malformed length at offset " + i + ": byte " + (buf[j] & 0xFF));
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

    static String toHex(String s) {
        byte[] bytes = s.getBytes(StandardCharsets.UTF_8);
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) sb.append(String.format("%02x", b & 0xFF));
        return sb.toString();
    }

    public static void main(String[] args) throws Exception {
        byte[] buf = Files.readAllBytes(Paths.get("/app/data.bin"));
        int numFields = Integer.parseInt(readField(buf, pos));
        for (int i = 0; i < numFields; i++) {
            String field = readField(buf, pos);
            System.out.println("F:" + toHex(field));
        }
        if (pos[0] != buf.length) {
            System.out.println("ERROR:unconsumed:" + (buf.length - pos[0]));
        } else {
            System.out.println("OK");
        }
    }
}
`

async function execInContainer(container, cmd) {
  const exec = await container.exec({
    Cmd: ['/bin/sh', '-c', cmd],
    AttachStdout: true,
    AttachStderr: true
  })
  const stream = await exec.start({ hijack: true, stdin: false })
  let stdout = '', stderr = ''
  await new Promise((resolve, reject) => {
    container.modem.demuxStream(
      stream,
      { write: c => stdout += c.toString() },
      { write: c => stderr += c.toString() }
    )
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  const inspect = await exec.inspect()
  return { stdout, stderr, exitCode: inspect.ExitCode }
}

async function main() {
  console.log('=== Netstring Parser Integration Test ===\n')

  let container
  try {
    container = await docker.createContainer({
      Image: IMAGE,
      Cmd: ['sh', '-lc', 'tail -f /dev/null'],
      WorkingDir: '/app',
      Tty: false,
    })
    await container.start()

    // Compile
    const compilePack = tar.pack()
    compilePack.entry({ name: 'NetstringTest.java' }, Buffer.from(JAVA_SOURCE))
    compilePack.finalize()
    await container.putArchive(compilePack, { path: '/app' })

    const compile = await execInContainer(container, 'javac NetstringTest.java')
    if (compile.exitCode !== 0) {
      console.error('COMPILATION FAILED:', compile.stderr || compile.stdout)
      process.exit(1)
    }
    console.log('Compilation: OK\n')

    let passed = 0, failed = 0

    for (const tc of TEST_CASES) {
      process.stdout.write(`  ${tc.name}... `)

      const encoded = Buffer.concat([
        encodeField(String(tc.fields.length)),
        ...tc.fields.map(f => encodeField(f))
      ])

      const dataPack = tar.pack()
      dataPack.entry({ name: 'data.bin' }, encoded)
      dataPack.finalize()
      await container.putArchive(dataPack, { path: '/app' })

      const result = await execInContainer(container, 'java NetstringTest')
      if (result.exitCode !== 0) {
        console.log(`FAIL (exit ${result.exitCode}): ${(result.stderr || result.stdout).substring(0, 120)}`)
        failed++
        continue
      }

      const lines = result.stdout.trim().split('\n')
      if (lines[lines.length - 1] !== 'OK') {
        console.log(`FAIL: ${lines[lines.length - 1]}`)
        failed++
        continue
      }

      let allMatch = true
      for (let i = 0; i < tc.fields.length; i++) {
        const expectedHex = Buffer.from(tc.fields[i], 'utf-8').toString('hex')
        const gotHex = lines[i].trim().replace(/^F:/, '')
        if (gotHex !== expectedHex) {
          console.log(`FAIL field ${i}: hex mismatch`)
          console.log(`  expected: ${expectedHex.substring(0, 60)}...`)
          console.log(`  got:      ${gotHex.substring(0, 60)}...`)
          allMatch = false
          break
        }
      }

      if (allMatch) { console.log('PASS'); passed++ }
      else { failed++ }
    }

    // Malformed length test
    process.stdout.write('  malformed length... ')
    let p = tar.pack(); p.entry({ name: 'data.bin' }, Buffer.from('1:1abc:hello')); p.finalize()
    await container.putArchive(p, { path: '/app' })
    let r = await execInContainer(container, 'java NetstringTest 2>&1')
    if (r.exitCode !== 0 || r.stdout.includes('Malformed')) {
      console.log('PASS (error detected)'); passed++
    } else { console.log(`FAIL (no error: ${r.stdout.substring(0, 80)})`); failed++ }

    // Truncated field test
    process.stdout.write('  truncated field... ')
    p = tar.pack(); p.entry({ name: 'data.bin' }, Buffer.from('1:110:short')); p.finalize()
    await container.putArchive(p, { path: '/app' })
    r = await execInContainer(container, 'java NetstringTest 2>&1')
    if (r.exitCode !== 0 || r.stdout.includes('overflows')) {
      console.log('PASS (error detected)'); passed++
    } else { console.log(`FAIL (no error: ${r.stdout.substring(0, 80)})`); failed++ }

    console.log(`\n=== Summary: ${passed} passed, ${failed} failed out of ${passed + failed} tests ===`)
    if (failed > 0) process.exit(1)

  } finally {
    if (container) {
      try { await container.stop({ t: 1 }) } catch {}
      try { await container.remove({ force: true }) } catch {}
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
