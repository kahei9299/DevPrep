import fs from 'fs/promises';
import Dockerode from 'dockerode';
import { resolveProblemFile } from './server/contentPaths';
import tar from 'tar-stream';
import { formatAndSplitJavaString, getDisplayFuncName, javaGetFullParam, javaHelperMethods, javaImage, javaListNodeClass, javaTreeNodeClass, javaGraphNodeClass } from './utils/javaUtil';
import { isTranscriptKind } from './utils/interactiveUtil';
import { ensureImageAvailable, LINUX_TIMEOUT_CODE, TIMEOUT_MESSAGE, type Param } from './utils/util';
import ContainerPool from './runners/ContainerPool';
import { cojudgeContainerLabels } from './server/containerSession';
import { cojudgeHostConfig } from './server/containerConfig';
import { PerfTimer } from './server/perfTimer';
import { computeMarkerHash, getCachedClasses, cacheClassFiles, packCachedWithData, evictCacheEntry } from './server/markerCache';
import { generateDataDrivenHarness, generateMarkerDataFile } from './server/markerHarness';

const docker = new Dockerode();

export type MarkerResponse = {
    actualAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
};

export async function getMarkerResponses(problemId: string, functionName: string, params: Param[], testCases: any, outputs: string[], outputType: string): Promise<MarkerResponse[]> {
    let interactive: any = null;
    try {
        const metaPath = await resolveProblemFile(problemId, 'metadata.json');
        const metaContent = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(metaContent);
        if (meta?.interactive?.secretField && isTranscriptKind(String(meta.interactive.kind ?? 'guess-word'))) interactive = meta.interactive;
    } catch {}

    const perf = new PerfTimer('run', problemId, 'marker', `marker-${problemId}`);
    perf.stage('resolveMarker');
    const markerPath = await resolveProblemFile(problemId, 'Marker.java');
    const markerCode = await fs.readFile(markerPath, 'utf-8');

    const mainJavaSource = generateDataDrivenHarness(functionName, params, outputType, interactive);
    const cacheHash = computeMarkerHash(
        markerCode, mainJavaSource,
        [javaListNodeClass, javaTreeNodeClass, javaGraphNodeClass],
        javaImage
    );

    perf.stage('cacheCheck');
    const cached = await getCachedClasses(cacheHash);

    const dataFile = generateMarkerDataFile(params, testCases, outputs, interactive);

    let container: Dockerode.Container | null = null;
    try {
        perf.stage('acquireContainer');
        container = await ContainerPool.acquire(javaImage);
        if (!container) {
            await ensureImageAvailable(docker, javaImage);
            container = await docker.createContainer({
                Image: javaImage,
                Cmd: ['sh', '-lc', 'tail -f /dev/null'],
                WorkingDir: '/app',
                Tty: false,
                Labels: cojudgeContainerLabels(),
                HostConfig: cojudgeHostConfig()
            });
            await container.start();
        }

        if (cached) {
            // Cache hit: upload .class files + data.txt, skip javac entirely
            perf.stage('uploadCached');
            const pack = packCachedWithData(cached, dataFile);
            await container.putArchive(pack as any, { path: '/app' });
        } else {
            // Cache miss: compile everything, then cache .class files
            perf.stage('uploadSources');
            const pack = tar.pack();
            pack.entry({ name: 'ListNode.java' }, Buffer.from(javaListNodeClass));
            pack.entry({ name: 'TreeNode.java' }, Buffer.from(javaTreeNodeClass));
            pack.entry({ name: 'GraphNode.java' }, Buffer.from(javaGraphNodeClass));
            pack.entry({ name: 'Marker.java' }, Buffer.from(markerCode));
            pack.entry({ name: 'Main.java' }, Buffer.from(mainJavaSource));
            pack.entry({ name: 'data.bin' }, dataFile);
            pack.finalize();
            await container.putArchive(pack as any, { path: '/app' });

            perf.stage('compileAll');
            const compileExec = await container.exec({
                Cmd: ['/bin/sh', '-c', 'javac *.java'],
                AttachStdout: true,
                AttachStderr: true
            });
            const cstream: any = await compileExec.start({ hijack: true, stdin: false });
            let cstdout = '';
            let cstderr = '';
            await new Promise((resolve, reject) => {
                (container as any).modem.demuxStream(
                    cstream,
                    { write: (chunk: any) => (cstdout += chunk.toString()) },
                    { write: (chunk: any) => (cstderr += chunk.toString()) }
                );
                cstream.on('end', resolve);
                cstream.on('error', reject);
            });
            const cinspect = await compileExec.inspect();
            if (cinspect.ExitCode === LINUX_TIMEOUT_CODE) {
                throw new Error(TIMEOUT_MESSAGE);
            }
            if (cinspect.ExitCode !== 0) {
                throw new Error(cstderr || cstdout);
            }

            perf.stage('cacheStore');
            await cacheClassFiles(cacheHash, container);
        }

        perf.stage('jvmRun');
        const runExec = await container.exec({
            Cmd: ['timeout', '15', '/bin/sh', '-c', 'java Main'],
            AttachStdout: true,
            AttachStderr: true
        });
        const rstream: any = await runExec.start({ hijack: true, stdin: false });
        let rstdout = '';
        let rstderr = '';
        await new Promise((resolve, reject) => {
            (container as any).modem.demuxStream(
                rstream,
                { write: (chunk: any) => (rstdout += chunk.toString()) },
                { write: (chunk: any) => (rstderr += chunk.toString()) }
            );
            rstream.on('end', resolve);
            rstream.on('error', reject);
        });
        const rinspect = await runExec.inspect();
        if (rinspect.ExitCode === LINUX_TIMEOUT_CODE) {
            throw new Error(TIMEOUT_MESSAGE);
        }
        if (rinspect.ExitCode !== 0) {
            // If cache hit produced a runtime error, evict and retry uncached
            if (cached) {
                evictCacheEntry(cacheHash);
                perf.stage('fallbackUncached');
                return getMarkerResponsesLegacy(
                    problemId, functionName, params, testCases, outputs, outputType,
                    interactive, container, perf
                );
            }
            throw new Error(rstderr || rstdout);
        }

        if (rstderr) {
            throw new Error(rstderr);
        }

        perf.stage('parseResults');
        const results = rstdout.split('---\n').filter(res => res.trim() !== '');
        perf.end();
        return results.map((x, i) => {
            const arr = x.split('\n');
            return {
                actualAnswer: outputs[i],
                isCorrect: arr[0] === 'true',
                correctAnswer: arr[1]
            } as MarkerResponse;
        });
    } catch (e) {
        perf.end('error');
        throw e;
    } finally {
        if (container) {
            await ContainerPool.release(javaImage, container);
        }
    }
}

/**
 * Legacy path: original inline-data harness. Used as fallback when the
 * data-driven cache produces a runtime error, to determine whether the
 * issue is in the cache or the user's output.
 */
async function getMarkerResponsesLegacy(
    problemId: string, functionName: string, params: Param[],
    testCases: any, outputs: string[], outputType: string,
    interactive: any, container: Dockerode.Container, perf: PerfTimer
): Promise<MarkerResponse[]> {
    const testCalls = testCases.map((tc: any, i: number) => {
        let fullParam = javaGetFullParam(params, tc);
        const out = formatAndSplitJavaString(outputs[i] ?? '');
        const toFunc = `to_${outputType}`;
        const displayFunc = getDisplayFuncName(outputType);
        if (interactive) {
            const secretVal = String(tc[interactive.secretField] ?? '');
            const secretLit = formatAndSplitJavaString(secretVal);
            return `try {
            System.out.println(marker.isCorrect(${fullParam}, ${toFunc}(${out})));
        } catch (Exception __e) { System.out.println("false"); }
        System.out.println(${displayFunc}(${secretLit}));
        System.out.println("---");`;
        }
        return `try {
            System.out.println(marker.isCorrect(${fullParam}, ${toFunc}(${out})));
        } catch (Exception __e) { System.out.println("false"); }
        System.out.println(${displayFunc}(marker.${functionName}(${fullParam})));
        System.out.println("---");`;
    }).join('\n        ');

    const runner = `
    import java.util.*;
    public class Main {
        ${javaHelperMethods}
        public static void main(String[] args) throws Exception {
            Marker marker = new Marker();
            ${testCalls}
        }
    }`;

    const markerPath = await resolveProblemFile(problemId, 'Marker.java');
    const markerCode = await fs.readFile(markerPath, 'utf-8');

    // Clean stale cached .class files before recompiling in the same container
    const cleanExec = await container.exec({
        Cmd: ['sh', '-c', 'rm -f /app/*.class /app/*.java /app/data.bin 2>/dev/null; mkdir -p /app'],
        AttachStdout: true, AttachStderr: true
    });
    const cleanStream: any = await cleanExec.start({ hijack: true, stdin: false });
    await new Promise<void>((resolve) => { cleanStream.on('end', resolve); cleanStream.resume(); setTimeout(resolve, 5000) });

    const pack = tar.pack();
    pack.entry({ name: 'ListNode.java' }, Buffer.from(javaListNodeClass));
    pack.entry({ name: 'TreeNode.java' }, Buffer.from(javaTreeNodeClass));
    pack.entry({ name: 'GraphNode.java' }, Buffer.from(javaGraphNodeClass));
    pack.entry({ name: 'Marker.java' }, Buffer.from(markerCode));
    pack.entry({ name: 'Main.java' }, Buffer.from(runner));
    pack.finalize();
    await container.putArchive(pack as any, { path: '/app' });

    const compileExec = await container.exec({
        Cmd: ['/bin/sh', '-c', 'javac *.java'],
        AttachStdout: true, AttachStderr: true
    });
    const cstream: any = await compileExec.start({ hijack: true, stdin: false });
    let cstdout = '', cstderr = '';
    await new Promise((resolve, reject) => {
        (container as any).modem.demuxStream(cstream,
            { write: (c: any) => (cstdout += c.toString()) },
            { write: (c: any) => (cstderr += c.toString()) });
        cstream.on('end', resolve);
        cstream.on('error', reject);
    });
    const cinspect = await compileExec.inspect();
    if (cinspect.ExitCode === LINUX_TIMEOUT_CODE) throw new Error(TIMEOUT_MESSAGE);
    if (cinspect.ExitCode !== 0) throw new Error(cstderr || cstdout);

    perf.stage('jvmRun');
    const runExec = await container.exec({
        Cmd: ['timeout', '15', '/bin/sh', '-c', 'java Main'],
        AttachStdout: true, AttachStderr: true
    });
    const rstream: any = await runExec.start({ hijack: true, stdin: false });
    let rstdout = '', rstderr = '';
    await new Promise((resolve, reject) => {
        (container as any).modem.demuxStream(rstream,
            { write: (c: any) => (rstdout += c.toString()) },
            { write: (c: any) => (rstderr += c.toString()) });
        rstream.on('end', resolve);
        rstream.on('error', reject);
    });
    const rinspect = await runExec.inspect();
    if (rinspect.ExitCode === LINUX_TIMEOUT_CODE) throw new Error(TIMEOUT_MESSAGE);
    if (rinspect.ExitCode !== 0) throw new Error(rstderr || rstdout);
    if (rstderr) throw new Error(rstderr);

    const results = rstdout.split('---\n').filter(res => res.trim() !== '');
    perf.end();
    return results.map((x, i) => {
        const arr = x.split('\n');
        return { actualAnswer: outputs[i], isCorrect: arr[0] === 'true', correctAnswer: arr[1] } as MarkerResponse;
    });
}
