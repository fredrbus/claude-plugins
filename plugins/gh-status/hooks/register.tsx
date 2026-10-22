import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot, Verdict } from '../types'
import { PR_FIELDS, RUN_FIELDS, age, parsePrs, parseRuns } from './github'

const PANE = 'gh-status'
const TITLE = 'GitHub'
const EVERY_MS = 60_000

const empty: Snapshot = { branch: '', prs: [], runs: [], updatedAt: 0, isLoading: true }
const snapshot = atom({ plugin: 'gh-status', key: 'snapshot' } as const, empty)

const MARK: Record<Verdict, { sign: string; color: string }> = {
  pass: { sign: '✓', color: 'green' },
  fail: { sign: '✗', color: 'red' },
  running: { sign: '●', color: 'yellow' },
  none: { sign: '·', color: 'gray' },
}

async function gh($: EngineInterface, args: string[]): Promise<string> {
  const { exitCode, stdout, stderr } = await $.process.run(['gh', ...args], { timeoutMs: 20_000 })
  if (exitCode !== 0) throw new Error(stderr.trim().split('\n')[0] || `gh ${args[0]} failed`)
  return stdout
}

async function refresh($: EngineInterface): Promise<void> {
  await update($, snapshot, old => ({ ...old, isLoading: true }))
  try {
    const git = await $.process.run(['git', 'branch', '--show-current'])
    const branch = git.stdout.trim()
    const [openJson, currentJson, runsJson] = await Promise.all([
      gh($, ['pr', 'list', '--state', 'open', '--search', 'draft:false', '--limit', '20', '--json', PR_FIELDS]),
      branch ? gh($, ['pr', 'view', branch, '--json', PR_FIELDS]).catch(() => undefined) : undefined,
      gh($, ['run', 'list', '--limit', '40', '--json', RUN_FIELDS]),
    ])
    const now = await $.clock.now()
    const next: Snapshot = {
      branch,
      prs: parsePrs(openJson, currentJson, branch),
      runs: parseRuns(runsJson, branch),
      updatedAt: now,
      isLoading: false,
    }
    await update($, snapshot, () => next)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await update($, snapshot, old => ({ ...old, error: message, isLoading: false }))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'gh-status', description: 'Show open pull requests and builds on GitHub' })
    void $.ui.open({ id: PANE, title: TITLE })
    void refresh($)
    $.clock.every(EVERY_MS, () => void refresh($))

    return next(e)
  })

  on('command.run', { command: 'gh-status' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    void refresh($)

    return { text: 'GitHub pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Link, Button } = $.ui.resolve(e)
    const shot = await read($, snapshot)
    const now = await $.clock.now()

    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>
            {shot.branch ? `on ${shot.branch} · ` : ''}
            {shot.isLoading ? 'updating…' : shot.updatedAt ? `updated ${age(new Date(shot.updatedAt).toISOString(), now)} ago ` : ''}
          </Text>
          <Button key="refresh" label="Refresh" hotkey="r" onPress={() => refresh($)} />
        </Box>
        {shot.error && <Text color="red">{shot.error}</Text>}

        <Text bold>Pull requests</Text>
        {shot.prs.length === 0 && <Text dimColor>No open pull requests.</Text>}
        {shot.prs.map(pr => (
          <Box flexDirection="column" key={`pr-${pr.number}`}>
            <Text wrap="truncate-end">
              <Text color={MARK[pr.checks].color}>{MARK[pr.checks].sign} </Text>
              <Link href={pr.url} label={`#${pr.number}`} /> {pr.title}
            </Text>
            <Text dimColor wrap="truncate-end">
              {'  '}
              {pr.isCurrent ? '★ ' : ''}
              {pr.branch}
              {pr.review ? ` · ${pr.review.toLowerCase().replace('_', ' ')}` : ''}
            </Text>
          </Box>
        ))}

        <Text> </Text>
        <Text bold>Builds</Text>
        {shot.runs.length === 0 && <Text dimColor>No builds on this branch or main.</Text>}
        {shot.runs.map(run => (
          <Text wrap="truncate-end" key={`run-${run.id}`}>
            <Text color={MARK[run.verdict].color}>{MARK[run.verdict].sign} </Text>
            <Link href={run.url} label={run.workflow} />
            <Text dimColor>
              {' '}
              {run.branch} · {age(run.createdAt, now)}
            </Text>
          </Text>
        ))}
      </Box>
    )
  })
}
