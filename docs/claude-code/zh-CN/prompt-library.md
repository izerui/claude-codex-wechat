> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 提示词库

> 复制粘贴提示词到 Claude Code，按任务和角色标记。

export const PromptLibrary = ({text = {}, labels = {}, tagLabels = {}, phaseLabels = {}, sourceLabels = {}, catLabels = {}}) => {
  const RAW = useMemo(() => [{
    id: 'get-oriented-in-a',
    sdlc: 'discover',
    cat: 'Onboard',
    startN: 1,
    roles: [],
    prompt: 'give me an overview of this codebase: architecture, key directories, and how the pieces connect',
    nextHref: '/en/memory',
    src: 'workflows'
  }, {
    id: 'explain-unfamiliar-code',
    sdlc: 'discover',
    cat: 'Understand',
    roles: [],
    prompt: 'explain what {path} does and how data flows through it. write it up as {format}',
    slots: {
      path: 'src/scheduler/queue.ts',
      format: 'an HTML page with a diagram, then open it in my browser'
    },
    nextHref: '/en/output-styles',
    src: 'workflows'
  }, {
    id: 'find-where-something-happens',
    sdlc: 'discover',
    cat: 'Understand',
    startN: 2,
    roles: [],
    prompt: 'where do we {behavior}?',
    slots: {
      behavior: 'validate uploaded file types'
    },
    src: 'workflows'
  }, {
    id: 'see-what-depends-on',
    sdlc: 'discover',
    cat: 'Understand',
    roles: [],
    prompt: 'what would break if I deleted {target}?',
    slots: {
      target: 'the retryWithBackoff helper'
    },
    src: 'workflows'
  }, {
    id: 'trace-how-code-evolved',
    sdlc: 'discover',
    cat: 'Understand',
    roles: [],
    prompt: 'look through the commit history of {path} and summarize how it evolved and why',
    slots: {
      path: 'internal/auth/session.go'
    },
    src: 'best-practices'
  }, {
    id: 'scope-a-change-before',
    sdlc: 'discover',
    cat: 'Understand',
    roles: ['pm', 'design'],
    prompt: 'which files would I need to touch to {change}?',
    slots: {
      change: 'add a dark mode toggle to settings'
    },
    src: 'teams'
  }, {
    id: 'ask-the-codebase-a',
    sdlc: 'discover',
    cat: 'Understand',
    roles: ['pm'],
    prompt: 'I am a {role}. walk me through what happens when a user {action}, from the UI down to the result',
    slots: {
      role: 'PM',
      action: 'clicks Export to PDF'
    },
    nextHref: '/en/output-styles',
    src: 'teams'
  }, {
    id: 'plan-a-multi-file',
    sdlc: 'design',
    cat: 'Plan',
    roles: ['pm', 'design'],
    prompt: 'plan how to refactor the {target} to {goal}. list the files you would change, but don\'t edit anything yet',
    slots: {
      target: 'payment module',
      goal: 'support multiple currencies'
    },
    src: 'workflows'
  }, {
    id: 'draft-a-spec-by',
    sdlc: 'design',
    cat: 'Plan',
    roles: ['pm'],
    prompt: 'I want to build {feature}. interview me about implementation, UX, edge cases, and tradeoffs until we have covered everything, then write the spec to SPEC.md',
    slots: {
      feature: 'per-workspace rate limits'
    },
    nextHref: '/en/skills',
    src: 'best-practices'
  }, {
    id: 'turn-a-meeting-into',
    sdlc: 'design',
    cat: 'Plan',
    roles: ['pm'],
    prompt: 'read {input} and write up the action items, then create a {tracker} ticket for each with acceptance criteria',
    slots: {
      input: '@meeting-notes.md',
      tracker: 'Linear'
    },
    needs: 'tracker',
    nextHref: '/en/skills',
    src: 'teams'
  }, {
    id: 'map-edge-cases-before',
    sdlc: 'design',
    cat: 'Plan',
    roles: ['design', 'pm'],
    prompt: 'list the error states, empty states, and edge cases for {feature} that the design needs to cover',
    slots: {
      feature: 'the file upload flow'
    },
    src: 'teams'
  }, {
    id: 'turn-a-mockup-into',
    sdlc: 'design',
    cat: 'Prototype',
    roles: ['design', 'pm', 'marketing'],
    paste: 'mockup',
    prompt: 'here is a mockup. build a working prototype I can click through, matching the layout and states shown',
    src: 'teams'
  }, {
    id: 'implement-from-a-screenshot',
    sdlc: 'design',
    cat: 'Prototype',
    roles: ['design'],
    paste: 'design',
    needs: 'browser',
    prompt: 'implement this design, then take a screenshot of the result, compare it to the original, and fix any differences',
    nextHref: '/en/goal',
    src: 'best-practices'
  }, {
    id: 'follow-an-existing-pattern',
    sdlc: 'build',
    cat: 'Implement',
    roles: [],
    prompt: 'look at how {example} is implemented to understand the pattern, then build {new} the same way',
    slots: {
      example: 'the GitHub webhook handler',
      new: 'a Stripe webhook handler'
    },
    nextHref: '/en/memory',
    src: 'best-practices'
  }, {
    id: 'generate-docs-for-code',
    sdlc: 'build',
    cat: 'Implement',
    roles: ['docs'],
    prompt: 'find {scope} without {format} comments and add them, matching the style already used in the file',
    slots: {
      scope: 'the public functions in src/auth/',
      format: 'JSDoc'
    },
    src: 'workflows'
  }, {
    id: 'add-a-small-well',
    sdlc: 'build',
    cat: 'Implement',
    roles: [],
    prompt: 'add a {endpoint} endpoint that returns {payload}',
    slots: {
      endpoint: '/health',
      payload: 'the app version and uptime'
    },
    src: 'workflows'
  }, {
    id: 'build-a-small-internal',
    sdlc: 'build',
    cat: 'Implement',
    roles: ['pm', 'design', 'marketing', 'docs'],
    prompt: 'create a {tool} using HTML, CSS, and vanilla JavaScript, then open it in my browser',
    slots: {
      tool: 'drag-and-drop Kanban board with three columns'
    },
    src: 'teams'
  }, {
    id: 'work-an-issue-end',
    sdlc: 'build',
    cat: 'Implement',
    roles: [],
    prompt: 'read issue #{issue}, implement the fix, and run the tests',
    slots: {
      issue: '312'
    },
    needs: 'gh',
    src: 'workflows'
  }, {
    id: 'find-and-update-copy',
    sdlc: 'build',
    cat: 'Implement',
    roles: ['design', 'docs', 'marketing'],
    prompt: 'find every place we say "{copy}" or a close variant, show me each one in context, then update them all to "{new}". leave tests and the changelog alone',
    slots: {
      copy: 'Sign up free',
      new: 'Start free trial'
    },
    src: 'teams'
  }, {
    id: 'draft-from-past-examples',
    sdlc: 'build',
    cat: 'Implement',
    roles: ['docs', 'marketing', 'pm'],
    prompt: 'read the {examples} in {folder} to learn the structure and voice, then draft a new one for {topic}',
    slots: {
      examples: 'privacy impact assessments',
      folder: 'legal/pia/',
      topic: 'the new analytics integration'
    },
    nextHref: '/en/skills',
    src: 'legal'
  }, {
    id: 'write-tests-run-them',
    sdlc: 'build',
    cat: 'Test',
    startN: 4,
    roles: [],
    prompt: 'write tests for {path}, run them, and fix any failures',
    slots: {
      path: 'app/parsers/feed.py'
    },
    nextHref: '/en/memory',
    src: 'workflows'
  }, {
    id: 'drive-implementation-from-tests',
    sdlc: 'build',
    cat: 'Test',
    roles: [],
    prompt: 'write tests for {feature} first, then implement it until they pass',
    slots: {
      feature: 'the password reset flow'
    },
    src: 'ebook'
  }, {
    id: 'fill-gaps-from-a',
    sdlc: 'build',
    cat: 'Test',
    roles: [],
    prompt: 'read {report} and add tests for the lowest-covered files until each is above {target}%',
    slots: {
      report: 'coverage/coverage-summary.json',
      target: '80'
    },
    nextHref: '/en/goal',
    src: 'workflows'
  }, {
    id: 'migrate-a-pattern-across',
    sdlc: 'build',
    cat: 'Refactor',
    roles: [],
    prompt: 'migrate everything from {from} to {to}: identify every place that needs to change, then make the changes',
    slots: {
      from: 'the old logging API',
      to: 'the structured logger'
    },
    src: 'workflows'
  }, {
    id: 'port-code-between-languages',
    sdlc: 'build',
    cat: 'Refactor',
    roles: [],
    prompt: 'port {source} to {target}, keeping the same {keep}',
    slots: {
      source: 'this Python module',
      target: 'Rust',
      keep: 'public API and test behavior'
    },
    src: 'teams'
  }, {
    id: 'optimize-against-a-measurable',
    sdlc: 'build',
    cat: 'Refactor',
    roles: ['data'],
    prompt: 'optimize {target} to bring {metric} from {current} down to under {goal}',
    slots: {
      target: 'the search query',
      metric: 'p95 latency',
      current: '2s',
      goal: '500ms'
    },
    nextHref: '/en/goal',
    src: 'ebook'
  }, {
    id: 'fix-a-precise-visual',
    sdlc: 'build',
    cat: 'Refactor',
    roles: ['design'],
    prompt: 'the {element} extends {amount} beyond the {container} on {viewport}. fix it.',
    slots: {
      element: 'login button',
      amount: '20px',
      container: 'card border',
      viewport: 'mobile'
    },
    nextHref: '/en/desktop#preview-your-app',
    src: 'ebook'
  }, {
    id: 'review-your-changes-before',
    sdlc: 'build',
    cat: 'Review',
    startN: 5,
    roles: [],
    prompt: 'review my uncommitted changes and flag anything that looks risky before I commit',
    nextHref: '/en/commands',
    src: 'workflows'
  }, {
    id: 'review-a-pull-request',
    sdlc: 'build',
    cat: 'Review',
    roles: [],
    prompt: 'review PR #{pr} and summarize what changed, then list any concerns',
    slots: {
      pr: '247'
    },
    needs: 'gh',
    nextHref: '/en/code-review',
    src: 'workflows'
  }, {
    id: 'review-infrastructure-changes-before',
    sdlc: 'build',
    cat: 'Review',
    roles: ['security', 'ops'],
    paste: 'plan',
    prompt: 'here is my Terraform plan output. what is this going to do, and is anything here going to cause problems?',
    src: 'teams'
  }, {
    id: 'run-a-security-review',
    sdlc: 'build',
    cat: 'Review',
    roles: ['security'],
    prompt: 'use a subagent to review {path} for security issues and report what it finds',
    slots: {
      path: 'src/api/'
    },
    nextHref: '/en/sub-agents',
    src: 'best-practices'
  }, {
    id: 'review-content-before-sending',
    sdlc: 'build',
    cat: 'Review',
    roles: ['marketing', 'docs'],
    prompt: 'review {file} for {concerns} and list anything I should fix before it goes to {reviewer}',
    slots: {
      file: 'launch-post.md',
      concerns: 'unsupported claims, missing attributions, and brand-guideline issues',
      reviewer: 'legal'
    },
    nextHref: '/en/skills',
    src: 'legal'
  }, {
    id: 'course-correct-a-wrong',
    sdlc: 'build',
    cat: 'Steer',
    roles: [],
    prompt: 'that is not right: {feedback}. try a different approach',
    slots: {
      feedback: 'the function signature needs to stay backward-compatible'
    },
    nextHref: '/en/checkpointing',
    src: 'best-practices'
  }, {
    id: 'narrow-the-scope-of',
    sdlc: 'build',
    cat: 'Steer',
    roles: [],
    prompt: 'that is too much. keep only the changes to {scope} and undo your other edits',
    slots: {
      scope: 'the validation logic in src/forms/'
    },
    src: 'best-practices'
  }, {
    id: 'turn-a-correction-into',
    sdlc: 'build',
    cat: 'Steer',
    roles: [],
    prompt: 'you keep {mistake}. add a rule to CLAUDE.md so this stops happening',
    slots: {
      mistake: 'using default exports when this project uses named exports'
    },
    nextHref: '/en/memory',
    src: 'best-practices'
  }, {
    id: 'resolve-merge-conflicts',
    sdlc: 'ship',
    cat: 'Git',
    roles: [],
    prompt: 'resolve the merge conflicts in this branch and explain what you kept from each side',
    src: 'workflows'
  }, {
    id: 'commit-with-a-generated',
    sdlc: 'ship',
    cat: 'Git',
    roles: [],
    prompt: 'commit these changes with a message that summarizes what I did',
    src: 'workflows'
  }, {
    id: 'open-a-pull-request',
    sdlc: 'ship',
    cat: 'Git',
    roles: [],
    prompt: 'find the {tracker} ticket about {topic} and open a PR that implements it',
    slots: {
      tracker: 'Linear',
      topic: 'the login timeout'
    },
    needs: 'tracker',
    src: 'workflows'
  }, {
    id: 'draft-release-notes-from',
    sdlc: 'ship',
    cat: 'Release',
    roles: ['pm', 'docs', 'marketing'],
    prompt: 'compare {from} to {to} and draft release notes grouped by feature, fix, and breaking change',
    slots: {
      from: 'v2.3.0',
      to: 'v2.4.0'
    },
    nextHref: '/en/skills',
    src: 'workflows'
  }, {
    id: 'write-a-ci-workflow',
    sdlc: 'ship',
    cat: 'Release',
    roles: ['ops'],
    prompt: 'write a GitHub Actions workflow that {steps} on every push to {branch}',
    slots: {
      steps: 'runs the tests and deploys to staging',
      branch: 'main'
    },
    src: 'workflows'
  }, {
    id: 'find-and-fix-a',
    sdlc: 'operate',
    cat: 'Debug',
    startN: 3,
    roles: [],
    prompt: 'the {test} test is failing, find out why and fix it',
    slots: {
      test: 'UserAuth'
    },
    src: 'workflows'
  }, {
    id: 'investigate-a-reported-error',
    sdlc: 'operate',
    cat: 'Debug',
    roles: ['ops'],
    prompt: 'users are seeing {symptom} on {where}. investigate and tell me what is going on',
    slots: {
      symptom: '500 errors',
      where: '/api/settings'
    },
    nextHref: '/en/web-quickstart#pre-fill-sessions',
    src: 'workflows'
  }, {
    id: 'fix-a-build-error',
    sdlc: 'operate',
    cat: 'Debug',
    roles: ['ops'],
    paste: 'error',
    prompt: 'here is a build error. fix the root cause and verify the build succeeds',
    src: 'best-practices'
  }, {
    id: 'investigate-a-production-incident',
    sdlc: 'operate',
    cat: 'Incident',
    roles: ['ops', 'security'],
    prompt: '{symptom}. check the logs, recent deploys, and config changes, then tell me the most likely cause',
    slots: {
      symptom: 'the checkout endpoint started returning 500s an hour ago'
    },
    nextHref: '/en/mcp',
    src: 'workflows'
  }, {
    id: 'diagnose-from-a-console',
    sdlc: 'operate',
    cat: 'Incident',
    roles: ['ops', 'data'],
    paste: 'screenshot',
    prompt: 'here is a screenshot of {console}. walk me through why {resource} is failing and give me the exact commands to fix it',
    slots: {
      console: 'the GCP Kubernetes dashboard',
      resource: 'this pod'
    },
    src: 'teams'
  }, {
    id: 'query-logs-in-plain',
    sdlc: 'operate',
    cat: 'Incident',
    roles: ['security', 'ops', 'data'],
    prompt: 'show me all {events} for {scope} over {timeframe}. write the query, run it, and tell me what stands out',
    slots: {
      events: 'failed logins',
      scope: 'the auth service',
      timeframe: 'the past 24 hours'
    },
    needs: 'db',
    src: 'cybersecurity'
  }, {
    id: 'analyze-a-data-file',
    sdlc: 'operate',
    cat: 'Data',
    roles: ['data', 'pm', 'marketing'],
    paste: 'csv',
    prompt: 'read {file}, summarize the key patterns, and write the results to {output}',
    slots: {
      file: '@reports/q1-signups.csv',
      output: 'an HTML page with charts, then open it in my browser'
    },
    nextHref: '/en/mcp',
    src: 'teams'
  }, {
    id: 'generate-variations-from-performance',
    sdlc: 'operate',
    cat: 'Data',
    roles: ['marketing', 'data'],
    paste: 'csv',
    prompt: 'read {file}, find the underperforming {items}, and generate {n} new variations that stay under {limit} characters',
    slots: {
      file: '@ads-performance.csv',
      items: 'headlines',
      n: '20',
      limit: '90'
    },
    nextHref: '/en/mcp',
    src: 'teams'
  }, {
    id: 'turn-a-recurring-task',
    sdlc: 'operate',
    cat: 'Automate',
    roles: [],
    prompt: 'create a /{name} skill for this project that {steps}',
    slots: {
      name: 'ship',
      steps: 'runs the linter and tests, then drafts a commit message'
    },
    src: 'workflows'
  }, {
    id: 'add-a-hook-for',
    sdlc: 'operate',
    cat: 'Automate',
    roles: [],
    prompt: 'write a hook that {action} after every {event}',
    slots: {
      action: 'runs prettier',
      event: 'edit to a .ts or .tsx file'
    },
    src: 'best-practices'
  }, {
    id: 'connect-a-tool-with',
    sdlc: 'operate',
    cat: 'Automate',
    roles: [],
    prompt: 'set up the {server} MCP server so you can read my {data} directly',
    slots: {
      server: 'Sentry',
      data: 'error reports'
    },
    src: 'workflows'
  }, {
    id: 'capture-what-to-remember',
    sdlc: 'operate',
    cat: 'Automate',
    roles: ['pm', 'docs'],
    prompt: 'summarize what we did this session and suggest what to add to CLAUDE.md',
    src: 'teams'
  }], []);
  const PROMPTS = useMemo(() => {
    if (typeof window !== 'undefined') {
      const rawIds = new Set(RAW.map(p => p.id));
      RAW.forEach(p => {
        if (!text[p.id]) console.warn('[prompt-library] no text[] entry for id:', p.id);
      });
      Object.keys(text).forEach(k => {
        if (!rawIds.has(k)) console.warn('[prompt-library] orphaned text[] key:', k);
      });
    }
    return RAW.map(p => ({
      ...p,
      title: p.id,
      teaches: '',
      ...text[p.id] || ({})
    }));
  }, [RAW, text]);
  const L = labels;
  const TL = k => tagLabels[k] || k;
  const CAT_TAG = useMemo(() => ({
    Onboard: 'understand',
    Understand: 'understand',
    Plan: 'plan',
    Prototype: 'prototype',
    Implement: 'build',
    Test: 'test',
    Refactor: 'refactor',
    Review: 'review',
    Steer: 'steer',
    Git: 'git',
    Release: 'release',
    Debug: 'debug',
    Incident: 'debug',
    Data: 'data',
    Automate: 'automate'
  }), []);
  const TAGS = useMemo(() => ['understand', 'plan', 'prototype', 'build', 'test', 'refactor', 'review', 'steer', 'debug', 'git', 'release', 'data', 'automate', 'pm', 'design', 'docs', 'marketing', 'security', 'ops'], []);
  const tagsOf = p => [CAT_TAG[p.cat], ...p.roles || []];
  const doc = useMemo(() => {
    const p = typeof window !== 'undefined' ? window.location.pathname : '';
    const base = p.startsWith('/docs/') ? '/docs' : '';
    const m = p.slice(base.length).match(/^\/([a-z]{2}(?:-[A-Z]{2})?)\//);
    const locale = m ? m[1] : 'en';
    return href => {
      if (!href || href[0] !== '/' || href[1] === '/') return href;
      return base + (href.startsWith('/en/') ? '/' + locale + href.slice(3) : href);
    };
  }, []);
  const linkify = s => {
    const out = [];
    let last = 0;
    const re = /\[([^\]]+)\]\(([^)]+)\)/g;
    for (let m; m = re.exec(s); ) {
      if (m.index > last) out.push(s.slice(last, m.index));
      out.push(<a key={m.index} href={doc(m[2])}>{m[1]}</a>);
      last = re.lastIndex;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  };
  const codeify = s => s.split(/(`[^`]+`)/g).map((part, i) => part[0] === '`' ? <code key={i}>{part.slice(1, -1)}</code> : part);
  const SOURCES = useMemo(() => ({
    'workflows': '/en/common-workflows',
    'teams': 'https://claude.com/blog/how-anthropic-teams-use-claude-code',
    'legal': 'https://claude.com/blog/how-anthropic-uses-claude-legal',
    'cybersecurity': 'https://claude.com/blog/how-anthropic-uses-claude-cybersecurity',
    'best-practices': '/en/best-practices',
    'ebook': 'https://resources.anthropic.com/hubfs/Scaling%20agentic%20coding%20across%20your%20organization.pdf'
  }), []);
  const [mounted, setMounted] = useState(false);
  const [q, setQ] = useState('');
  const [start, setStart] = useState(true);
  const [sel, setSel] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [copied, setCopied] = useState(null);
  const [fills, setFills] = useState({});
  const copyTimer = useRef(null);
  useEffect(() => {
    setMounted(true);
    return () => clearTimeout(copyTimer.current);
  }, []);
  const setFill = (id, key, val) => setFills(f => ({
    ...f,
    [id + '.' + key]: val
  }));
  const fillOf = (p, key) => {
    const v = fills[p.id + '.' + key];
    return v !== undefined ? v : p.slots && p.slots[key] !== undefined ? p.slots[key] : '';
  };
  const assemble = p => p.prompt.replace(/\{(\w+)\}/g, (_, k) => fillOf(p, k) || p.slots && p.slots[k] || k);
  const preview = p => p.prompt.replace(/\{(\w+)\}/g, (_, k) => p.slots && p.slots[k] || k);
  const bodyText = p => preview(p) + ' ' + p.teaches.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') + ' ' + (p.next || '');
  const widthFor = s => (s || '').length + 3 + 'ch';
  const ql = q.trim().toLowerCase();
  const toggleTag = k => {
    setStart(false);
    setSel(s => !ql && s === k ? null : k);
  };
  const clear = () => {
    setStart(false);
    setSel(null);
    setQ('');
  };
  const results = useMemo(() => {
    const list = PROMPTS.filter(p => {
      if (ql) return p.title.toLowerCase().includes(ql) || bodyText(p).toLowerCase().includes(ql);
      if (start) return !!p.startN;
      if (sel) return tagsOf(p).includes(sel);
      return true;
    });
    if (ql) return list;
    if (start) return list.sort((a, b) => a.startN - b.startN);
    if (sel) return list.sort((a, b) => (a.roles || []).length - (b.roles || []).length || (b.sdlc === 'operate') - (a.sdlc === 'operate'));
    return list;
  }, [PROMPTS, ql, start, sel]);
  const matchSnippet = p => {
    if (!ql || p.title.toLowerCase().includes(ql)) return null;
    const txt = bodyText(p);
    const at = txt.toLowerCase().indexOf(ql);
    if (at < 0) return null;
    const lo = Math.max(0, at - 30), hi = Math.min(txt.length, at + ql.length + 50);
    return [lo > 0 ? '…' : '', txt.slice(lo, at), <mark key="m">{txt.slice(at, at + ql.length)}</mark>, txt.slice(at + ql.length, hi), hi < txt.length ? '…' : ''];
  };
  const grouped = useMemo(() => {
    if (start && !q.trim()) return [];
    const g = {};
    for (const p of results) {
      const key = p.sdlc + '|' + p.cat;
      (g[key] = g[key] || ({
        sdlc: p.sdlc,
        cat: p.cat,
        items: []
      })).items.push(p);
    }
    return Object.values(g);
  }, [results, start, q]);
  const copy = async (str, id) => {
    try {
      await navigator.clipboard.writeText(str);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    clearTimeout(copyTimer.current);
    setCopied(id);
    copyTimer.current = setTimeout(() => setCopied(null), 1600);
  };
  const promptBody = p => {
    if (!p.slots) return <code>{p.prompt}</code>;
    const parts = p.prompt.split(/(\{\w+\})/g);
    return <code>
        {parts.map((part, idx) => {
      const m = part.match(/^\{(\w+)\}$/);
      if (!m) return <span key={idx}>{part}</span>;
      const k = m[1];
      const val = fillOf(p, k);
      return <input key={idx} type="text" className="pl-slot" value={val} placeholder={p.slots[k] || k} aria-label={k} style={{
        width: widthFor(val || p.slots[k])
      }} onChange={e => setFill(p.id, k, e.target.value)} onFocus={e => e.target.select()} onClick={e => e.stopPropagation()} />;
    })}
      </code>;
  };
  const card = p => {
    const open = openId === p.id;
    const srcHref = SOURCES[p.src];
    const srcLabel = sourceLabels[p.src];
    const snip = matchSnippet(p);
    return <div key={p.id} className={'pl-card' + (open ? ' pl-open' : '')}>
        <button type="button" className="pl-head" onClick={() => setOpenId(open ? null : p.id)} aria-expanded={open}>
          <span className="pl-title">{p.title}</span>
          {!!p.startN && <span className="pl-chip">{L.startHere} · {p.startN}</span>}
        </button>
        {snip ? <div className="pl-match">{snip}</div> : <code className="pl-prompt-preview">{preview(p)}</code>}
        {open && <div className="pl-body">
            <div className="pl-label">{p.slots ? L.fillAndCopy : L.copyThis}</div>
            {p.needs && L.needs && L.needs[p.needs] && <div className="pl-hint pl-needs">
                <span className="pl-needs-label">{L.needsLabel}</span> {linkify(L.needs[p.needs])}
              </div>}
            {p.paste && L.paste && L.paste[p.paste] && <div className="pl-hint pl-paste">{L.paste[p.paste]}</div>}
            {p.slots && <div className="pl-hint">
                {L.hintBefore} <span className="pl-hint-chip">{L.hintChip}</span> {L.hintAfter}
              </div>}
            <div className="pl-prompt-box">
              <span className="pl-caret">{'❯'}</span>
              {promptBody(p)}
              <button type="button" className="pl-copy" onClick={() => copy(assemble(p), p.id)}>
                {copied === p.id ? L.copied : L.copy}
              </button>
            </div>
            <div className="pl-label">{L.whyWorks}</div>
            <div className="pl-teaches">{linkify(p.teaches)}</div>
            {p.nextHref && p.next && <div className="pl-next">
                <span className="pl-next-label">{L.makeItStick}</span>
                <a href={doc(p.nextHref)}>{codeify(p.next)} →</a>
              </div>}
            {srcLabel && <div className="pl-src">{L.from} {srcHref ? <a href={doc(srcHref)}>{srcLabel}</a> : srcLabel}</div>}
          </div>}
      </div>;
  };
  const STYLES = useMemo(() => `
.pl {
  --pl-accent: #D97757;
  --pl-accent-bg: rgba(217,119,87,0.07);
  --pl-bg: #fff;
  --pl-surface: #FAFAF7;
  --pl-border: #E8E6DC;
  --pl-border-subtle: rgba(31,30,29,0.08);
  --pl-text: #141413;
  --pl-text-2: #5E5D59;
  --pl-text-3: #73726C;
  --pl-text-4: #9C9A92;
  --pl-mono: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-family: 'Anthropic Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 16px; color: var(--pl-text); margin: 8px 0 32px;
}
.dark .pl {
  --pl-bg: #1f1e1d;
  --pl-surface: #262624;
  --pl-border: #3d3d3a;
  --pl-border-subtle: rgba(240,238,230,0.08);
  --pl-text: #f0eee6;
  --pl-text-2: #bfbdb4;
  --pl-text-3: #91908a;
  --pl-text-4: #73726c;
}
.pl *, .pl *::before, .pl *::after { box-sizing: border-box; }
.pl button { font-family: inherit; cursor: pointer; }
.pl a { color: var(--pl-accent); text-decoration: none; }
.pl a:hover { text-decoration: underline; }

.pl-search {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px; background: var(--pl-surface);
  border: 1px solid var(--pl-border); border-radius: 12px;
  margin-bottom: 14px;
}
.pl-search input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: 16px; color: var(--pl-text);
}
.pl-search input::placeholder { color: var(--pl-text-4); }

.pl-tags { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 18px; }
.pl-tag {
  padding: 7px 14px; border: 1px solid var(--pl-border); background: var(--pl-bg);
  font-size: 14px; color: var(--pl-text-2); border-radius: 999px;
}
.pl-tag:hover { background: var(--pl-surface); }
.pl-tag.pl-on { background: var(--pl-text); border-color: var(--pl-text); color: var(--pl-bg); }
.pl-tag.pl-start { color: var(--pl-accent); font-weight: 500; }
.pl-tag.pl-start.pl-on { background: var(--pl-accent); border-color: var(--pl-accent); color: #fff; }
.pl-tags.pl-dim .pl-tag { opacity: 0.5; }
.pl-tags.pl-dim .pl-tag:hover { opacity: 1; }
.pl-sep { width: 1px; height: 22px; background: var(--pl-border); margin: 0 4px; }
.pl-clear { border: none; background: none; font-size: 13px; color: var(--pl-text-4); padding: 4px 6px; }
.pl-clear:hover { color: var(--pl-text-2); }
.pl-count { margin-left: auto; font-size: 14px; color: var(--pl-text-4); }

.pl-group-h {
  font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--pl-text-4); margin: 24px 0 12px;
}
.pl-group-h .pl-phase { color: var(--pl-text-3); }
.pl-card {
  border: 1px solid var(--pl-border-subtle); border-radius: 10px;
  margin-bottom: 12px; background: var(--pl-bg); overflow: hidden;
  padding: 14px 18px;
}
.pl-card.pl-open { border-color: var(--pl-border); background: var(--pl-surface); }
.pl-head {
  width: 100%; display: flex; align-items: baseline; gap: 12px;
  border: none; background: transparent; text-align: left; padding: 0;
}
.pl-head:focus-visible { outline: 2px solid var(--pl-accent); outline-offset: 2px; border-radius: 6px; }
.pl-title {
  flex: 1; font-size: 17px; font-weight: 500; color: var(--pl-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pl-prompt-preview {
  display: block; font-family: var(--pl-mono); font-size: 13.5px; color: var(--pl-text-3);
  margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pl-chip {
  font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase;
  padding: 3px 9px; border-radius: 999px; flex-shrink: 0;
  background: var(--pl-accent-bg); color: var(--pl-accent);
}

.pl-body { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--pl-border-subtle); }
.pl-label {
  font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--pl-text-4); margin: 12px 0 8px;
}
.pl-prompt-box {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; background: #141413; color: #f0eee6;
  border-radius: 8px; font-family: var(--pl-mono); font-size: 15px;
}
.pl-caret { color: var(--pl-accent); flex-shrink: 0; }
.pl-prompt-box code { flex: 1; background: none; padding: 0; color: inherit; white-space: pre-wrap; line-height: 1.9; }
.pl-slot {
  font-family: var(--pl-mono); font-size: inherit;
  background: rgba(217,119,87,0.15); color: #f0eee6;
  border: none; border-bottom: 1.5px dashed var(--pl-accent);
  border-radius: 4px 4px 0 0; padding: 2px 6px; margin: 0 1px;
  outline: none; min-width: 6ch; max-width: 100%;
  box-sizing: content-box; cursor: text;
}
.pl-slot:hover { background: rgba(217,119,87,0.22); }
.pl-slot:focus { background: rgba(217,119,87,0.28); border-bottom-style: solid; }
.pl-slot::placeholder { color: rgba(240,238,230,0.4); font-style: italic; }
.pl-hint { font-size: 14px; color: var(--pl-text-3); margin: 0 0 10px; }
.pl-paste { color: var(--pl-text-2); }
.pl-needs { color: var(--pl-text-2); }
.pl-needs-label {
  display: inline-block; font-size: 10.5px; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 2px 7px; margin-right: 6px;
  border-radius: 4px; background: var(--pl-accent-bg); color: var(--pl-accent);
}
.pl-hint-chip {
  font-family: var(--pl-mono); font-size: 0.92em;
  background: var(--pl-accent-bg); color: var(--pl-accent);
  border-bottom: 1.5px dashed var(--pl-accent);
  border-radius: 3px 3px 0 0; padding: 1px 5px;
}
.pl-copy {
  font-size: 12.5px; padding: 6px 12px; border-radius: 6px;
  background: var(--pl-accent); color: #fff; border: none; flex-shrink: 0;
}
.pl-teaches { display: block; font-size: 15.5px; color: var(--pl-text-2); margin: 4px 0 0; line-height: 1.6; }
.pl-match {
  display: block; font-size: 13.5px; color: var(--pl-text-3);
  margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pl-match mark { background: var(--pl-accent-bg); color: var(--pl-text); padding: 1px 2px; border-radius: 3px; }
.pl-next {
  display: flex; align-items: baseline; gap: 10px;
  margin: 14px 0 0; padding: 10px 12px;
  background: var(--pl-accent-bg); border-radius: 8px; font-size: 14.5px;
}
.pl-next-label {
  font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--pl-accent); font-weight: 600; flex-shrink: 0;
}
.pl-src { display: block; font-size: 14px; color: var(--pl-text-4); margin: 14px 0 0; }

.pl-show-all {
  display: block; width: 100%; padding: 14px; margin-top: 4px;
  border: 1px dashed var(--pl-border); border-radius: 10px;
  background: transparent; font-size: 15px; color: var(--pl-accent);
  text-align: center;
}
.pl-show-all:hover { background: var(--pl-accent-bg); border-style: solid; }

.pl-empty {
  padding: 32px; text-align: center; color: var(--pl-text-4);
  border: 1px dashed var(--pl-border); border-radius: 10px;
}
`, []);
  if (!mounted) return <div className="pl" style={{
    minHeight: 480
  }} />;
  return <div className="pl">
      <style>{STYLES}</style>

      <div className="pl-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{
    color: 'var(--pl-text-4)'
  }}>
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input type="text" placeholder={L.search} value={q} onChange={e => {
    setQ(e.target.value);
    if (e.target.value) setStart(false);
  }} aria-label={L.search} />
      </div>

      <div className={'pl-tags' + (ql ? ' pl-dim' : '')}>
        <button type="button" className={'pl-tag pl-start' + (!ql && start ? ' pl-on' : '')} onClick={() => {
    setQ('');
    setStart(!start);
    if (!start) setSel(null);
  }}>
          ★ {L.startHere}
        </button>
        <span className="pl-sep" />
        {TAGS.map(k => <button key={k} type="button" aria-pressed={!ql && sel === k} className={'pl-tag' + (!ql && sel === k ? ' pl-on' : '')} onClick={() => {
    setQ('');
    toggleTag(k);
  }}>
            {TL(k)}
          </button>)}
        {(start || sel || q) && <button type="button" className="pl-clear" onClick={clear}>{L.clear}</button>}
        <span className="pl-count">{results.length} {results.length === 1 ? L.prompt : L.prompts}</span>
      </div>

      {results.length === 0 ? <div className="pl-empty">
          {L.noMatch} {ql ? <code>{q}</code> : null} <button type="button" className="pl-clear" onClick={clear}>{L.clear}</button>
        </div> : !ql && start ? <div>
          <div className="pl-group-h">{L.startHereHeader}</div>
          {results.map(card)}
          <button type="button" className="pl-show-all" onClick={clear}>
            {L.showAll && L.showAll.replace('{n}', PROMPTS.length)} →
          </button>
        </div> : grouped.map(g => <div key={g.sdlc + '|' + g.cat}>
            <div className="pl-group-h"><span className="pl-phase">{phaseLabels[g.sdlc] || g.sdlc}</span> · {catLabels[g.cat] || g.cat}</div>
            {g.items.map(card)}
          </div>)}
    </div>;
};

这是一个提示词库，可以复制到 Claude Code 中使用。使用它来探索你还没有尝试过的工作方式，或者当你不确定从哪里开始时。

这些提示词来自各种 Anthropic 指南，包括[常见工作流](/docs/zh-CN/common-workflows)、[最佳实践](/docs/zh-CN/best-practices)和[Anthropic 团队如何使用 Claude Code](https://claude.com/blog/how-anthropic-teams-use-claude-code)。它们是起点而不是脚本。打开任何提示词下的**为什么这样做有效**来查看其背后的模式，这样你可以编写自己的提示词。

export const labels = {
  startHere: "从这里开始",
  startHereHeader: "五个首先尝试的提示词",
  showAll: "显示全部 {n} 个提示词",
  search: "搜索提示词…",
  clear: "清除",
  prompt: "提示词",
  prompts: "提示词",
  noMatch: "没有匹配的提示词",
  fillAndCopy: "填写并复制",
  copyThis: "复制此提示词",
  hintBefore: "在",
  hintChip: "高亮显示的",
  hintAfter: "字段中输入以自定义，然后复制。",
  copy: "复制",
  copied: "已复制",
  whyWorks: "为什么这样做有效",
  makeItStick: "使其坚持",
  from: "来自",
  paste: {
    mockup: "粘贴、拖动或 @-提及你的模型图像，然后发送此内容：",
    design: "粘贴、拖动或 @-提及你的设计图像，然后发送此内容：",
    screenshot: "粘贴、拖动或 @-提及你的屏幕截图，然后发送此内容：",
    plan: "首先将你的计划输出粘贴到提示词中，然后发送此内容：",
    error: "首先将错误输出粘贴到提示词中，然后发送此内容：",
    csv: "将你的文件拖到提示词中，或将下面的路径替换为你自己的 @-提及："
  },
  needsLabel: "需要",
  needs: {
    tracker: "你的问题跟踪器添加为 [claude.ai 连接器](/docs/zh-CN/mcp#use-mcp-servers-from-claude-ai) 或 [MCP 服务器](/docs/zh-CN/mcp)。",
    gh: "[gh CLI](https://cli.github.com) 已认证，或 GitHub 添加为 [claude.ai 连接器](/docs/zh-CN/mcp#use-mcp-servers-from-claude-ai)。",
    browser: "Claude 能够呈现和截图结果的方式。[桌面应用](/docs/zh-CN/desktop#preview-your-app)内置了此功能。在终端中，安装 [Chrome 扩展](/docs/zh-CN/chrome)或 Playwright [MCP](/docs/zh-CN/mcp) 服务器。",
    db: "你的数据仓库或日志存储添加为 [claude.ai 连接器](/docs/zh-CN/mcp#use-mcp-servers-from-claude-ai) 或 [MCP 服务器](/docs/zh-CN/mcp)。"
  }
};

export const tagLabels = {
  understand: "理解",
  plan: "计划",
  prototype: "原型",
  build: "构建",
  test: "测试",
  refactor: "重构",
  review: "审查",
  steer: "引导",
  debug: "调试",
  git: "Git",
  release: "发布",
  data: "数据",
  automate: "自动化",
  pm: "产品",
  design: "设计",
  docs: "文档",
  marketing: "营销",
  security: "安全",
  ops: "值班"
};

export const phaseLabels = {
  discover: "发现",
  design: "设计",
  build: "构建",
  ship: "发布",
  operate: "运营"
};

export const sourceLabels = {
  workflows: "常见工作流",
  teams: "Anthropic 团队如何使用 Claude Code",
  legal: "Anthropic 如何在法律中使用 Claude",
  cybersecurity: "Anthropic 如何在网络安全中使用 Claude",
  "best-practices": "最佳实践",
  ebook: "扩展代理编码指南"
};

export const catLabels = {
  Onboard: "入职",
  Understand: "理解",
  Plan: "计划",
  Prototype: "原型",
  Implement: "实现",
  Test: "测试",
  Refactor: "重构",
  Review: "审查",
  Steer: "引导",
  Git: "Git",
  Release: "发布",
  Debug: "调试",
  Incident: "事件",
  Data: "数据",
  Automate: "自动化"
};

export const text = {
  "get-oriented-in-a": {
    title: "在新存储库中定位",
    teaches: "描述你想了解的内容，而不是要读哪些文件。Claude 自己探索项目并返回它如何组合在一起的摘要。",
    next: "运行 `/init` 来设置 `CLAUDE.md`，以便 Claude 在每个会话中记住这一点"
  },
  "explain-unfamiliar-code": {
    title: "解释不熟悉的代码",
    teaches: "命名文件并说出你想要答案的格式。将 HTML 页面交换为图表、项目符号或任何适合你学习方式的内容。",
    next: "设置输出样式，以便 Claude 始终以你喜欢的格式进行解释"
  },
  "find-where-something-happens": {
    title: "找到某事发生的地方",
    teaches: "按行为而不是按文件名搜索。即使你不知道文件叫什么或它位于哪个目录，搜索也能工作。"
  },
  "see-what-depends-on": {
    title: "在删除前检查什么会破坏",
    teaches: "在删除任何内容之前询问。调用者列表和下游影响告诉你是在看一行清理还是需要协调的更改。"
  },
  "trace-how-code-evolved": {
    title: "追踪代码如何演变",
    teaches: "当问题是为什么而不是什么时，指向提交历史。Claude 读取你使用的任何版本控制的日志和责备，并解释当前实现背后的决策。"
  },
  "scope-a-change-before": {
    title: "在开始前确定更改的范围",
    teaches: "在将工作提交到路线图之前调整其大小。文件列表告诉你是在看一个组件还是跨越式更改。"
  },
  "ask-the-codebase-a": {
    title: "向代码库提出产品问题",
    teaches: "说出你的角色，以便答案在正确的级别上。Claude 从源代码解释产品实际做什么，无需你阅读它。",
    next: "设置输出样式，以便 Claude 始终在此级别上提出答案"
  },
  "plan-a-multi-file": {
    title: "在触及代码前计划多文件更改",
    teaches: "添加\"不要编辑\"将探索与更改分开，所以你在任何代码移动前看到方法。要使计划优先成为每个提示词的默认值，按 Shift+Tab 进入[计划模式](/docs/zh-CN/permission-modes#analyze-before-you-edit-with-plan-mode)。"
  },
  "draft-a-spec-by": {
    title: "通过采访起草规范",
    teaches: "要求被采访而不是自己编写规范。Claude 提出结构化问题，直到需求完成，然后将结果写入文件。",
    next: "将你的采访问题保存为 `/spec` 技能，以便每个规范都以相同的方式开始"
  },
  "turn-a-meeting-into": {
    title: "将会议转变为工单",
    teaches: "跳过转录步骤。Claude 从非结构化输入中提取行动项，并通过 [MCP](/docs/zh-CN/mcp) 直接将其写入你的跟踪器，所以你审查工单，而不是转录。",
    next: "将此保存为 `/tickets` 技能"
  },
  "map-edge-cases-before": {
    title: "在构建前映射边界情况",
    teaches: "要求缺少什么，而不是有什么。Claude 列出快乐路径设计倾向于跳过的错误状态、空状态和边界情况。"
  },
  "turn-a-mockup-into": {
    title: "将模型转变为工作原型",
    teaches: "可点击的原型回答静态模型无法回答的问题。将工作代码交给工程部门，而不是在文档中解释交互。"
  },
  "implement-from-a-screenshot": {
    title: "从屏幕截图实现并自检",
    teaches: "这给 Claude 一个验证循环：它呈现、与源图像比较，并迭代，无需你指出每个差距。",
    next: "使用 `/goal` 让 Claude 继续迭代，直到屏幕截图匹配"
  },
  "follow-an-existing-pattern": {
    title: "遵循现有模式",
    teaches: "指向你已经喜欢的代码。没有参考，Claude 默认为一般最佳实践。有了参考，它匹配你的代码库实际使用的约定。",
    next: "要求 Claude 将其遵循的模式写入 `CLAUDE.md`，以便未来会话无需参考即可匹配它"
  },
  "add-a-small-well": {
    title: "添加一个小的、定义明确的功能",
    teaches: "说明输入和输出，而不是如何构建它。Claude 找到类似代码的位置并在其旁边添加你的代码。"
  },
  "build-a-small-internal": {
    title: "从头开始构建一个小的内部工具",
    teaches: "你不需要项目、框架或构建步骤。描述工具并要求 Claude 打开它，以便你立即看到它工作。"
  },
  "work-an-issue-end": {
    title: "端到端处理问题",
    teaches: "给出问题编号，而不是摘要。Claude 自己读取完整工单，所以你会忘记提及的需求会通过，它在报告前验证更改。"
  },
  "find-and-update-copy": {
    title: "在代码库中查找和更新副本",
    teaches: "要求变体并说出要跳过的内容。Claude 找到字面搜索会遗漏的措辞，并保持测试夹具和历史不变，所以你只审查用户实际看到的副本。"
  },
  "draft-from-past-examples": {
    title: "从过去的例子起草文档",
    teaches: "指向已完成工作的文件夹，而不是描述你的风格。Claude 从你已经发布的内容学习结构和声音，所以第一稿读起来像你的。",
    next: "将声音保存为技能，以便每个草稿都从那里开始"
  },
  "write-tests-run-them": {
    title: "编写测试、运行它们、修复失败",
    teaches: "一起要求编写、运行和修复，以便 Claude 迭代而无需停止以获取说明。",
    next: "运行 `/init` 以便 Claude 自动学习你的测试命令"
  },
  "drive-implementation-from-tests": {
    title: "从测试驱动实现",
    teaches: "测试驱动开发：测试定义工作何时完成，Claude 迭代实现直到它们通过。"
  },
  "fill-gaps-from-a": {
    title: "从覆盖率报告填补空白",
    teaches: "指向覆盖率报告而不是猜测什么是未测试的。Claude 读取实际数字并为最需要的文件编写测试。",
    next: "将此设置为 `/goal`，以便 Claude 继续编写测试，直到覆盖率达到目标"
  },
  "port-code-between-languages": {
    title: "将代码移植到另一种语言",
    teaches: "说出要保留的内容，而不仅仅是目标语言。命名必须保持相同的 API 或行为给 Claude 一个合同来检查端口。"
  },
  "generate-docs-for-code": {
    title: "为未记录的代码生成文档",
    teaches: "命名范围和格式。Claude 找到缺少的内容并匹配文件中已有的注释风格，所以新文档读起来像其余部分。"
  },
  "migrate-a-pattern-across": {
    title: "在代码库中迁移模式",
    teaches: "描述旧模式和新模式。要求 Claude 首先识别每个地方意味着调用站点在响应中列出，所以你可以检查没有遗漏。"
  },
  "optimize-against-a-measurable": {
    title: "针对可测量目标进行优化",
    teaches: "说明指标和目标给 Claude 一个明确的完成定义。",
    next: "将此设置为 `/goal`，以便 Claude 继续测量和迭代，直到达到数字"
  },
  "fix-a-precise-visual": {
    title: "修复精确的视觉错误",
    teaches: "精确的视觉反馈得到精确的修复。说明确切的元素、测量和视口。",
    next: "添加预览工具，以便 Claude 自己截图并验证修复"
  },
  "review-your-changes-before": {
    title: "在提交前审查你的更改",
    teaches: "在问题仍然便宜时捕获它们。Claude 完整读取更改的文件，而不仅仅是差异行，所以它发现快速自审会遗漏的问题。",
    next: "运行 `/code-review` 以在一个命令中进行相同的检查"
  },
  "review-a-pull-request": {
    title: "审查拉取请求",
    teaches: "Claude 在整个代码库的背景下审查，而不仅仅是差异。它读取更改的代码和它调用的内容，所以它捕获仅差异审查会遗漏的问题。",
    next: "使用代码审查为每个 PR 打开此功能"
  },
  "review-infrastructure-changes-before": {
    title: "在应用前审查基础设施更改",
    teaches: "计划输出密集且难以扫描。粘贴它会得到一个关于实际将要更改的内容的纯文本摘要，然后再应用它。"
  },
  "run-a-security-review": {
    title: "使用子代理运行安全审查",
    teaches: "[子代理](/docs/zh-CN/sub-agents)在其自己的上下文窗口中运行审计并报告回摘要，所以长安全审查不会填满你的主会话。内置的通用子代理无需额外设置即可处理此问题。",
    next: "设置一个专用的安全审查子代理，你的整个团队都可以使用"
  },
  "review-content-before-sending": {
    title: "在正式审查前捕获问题",
    teaches: "在人类花时间之前获得第一遍。命名你想检查的关注点，以便审查是有针对性的，然后修复它找到的内容并发送更清洁的草稿。",
    next: "将你的审查清单捕获为你的整个团队可以运行的技能"
  },
  "course-correct-a-wrong": {
    title: "纠正错误的方法",
    teaches: "命名 Claude 遗漏的约束，而不仅仅是它是错误的。具体的原因给 Claude 一个具体的约束来满足重试，而不是再次猜测。",
    next: "按 `Esc` 两次打开倒带菜单并恢复代码和对话，以便重试从干净开始"
  },
  "narrow-the-scope-of": {
    title: "缩小更改的范围",
    teaches: "当方向正确但更改过于宽泛时，要求 Claude 保留其中一部分而不是倒带所有内容。说明的边界使小修复不会变成重构。"
  },
  "turn-a-correction-into": {
    title: "将更正转变为规则",
    teaches: "聊天中的更正不与你的团队共享。项目的 [CLAUDE.md](/docs/zh-CN/memory) 中的规则在你提交后共享，Claude 在每个会话开始时读取它。",
    next: "打开 `/memory` 来审查 Claude 写了什么"
  },
  "resolve-merge-conflicts": {
    title: "解决合并冲突",
    teaches: "说出你想要的状态，而不是要保留哪些标记。要求推理使合并可审查，而不是黑盒。"
  },
  "commit-with-a-generated": {
    title: "使用生成的消息提交",
    teaches: "让 Claude 从差异中推导消息。它匹配你的存储库的现有提交风格。"
  },
  "open-a-pull-request": {
    title: "从工单打开拉取请求",
    teaches: "跳过跟踪器、编辑器和 GitHub 之间的上下文切换。一个提示词读取规范、进行更改并打开 PR。"
  },
  "draft-release-notes-from": {
    title: "从 git 历史起草发布说明",
    teaches: "给出两个参考点和你想要的结构。Claude 读取它们之间的提交日志并起草你可以编辑的更改日志。",
    next: "将此保存为 `/changelog` 技能"
  },
  "write-a-ci-workflow": {
    title: "编写 CI 工作流",
    teaches: "描述它应该何时运行以及它应该做什么；YAML 为你生成，与你的项目的构建和测试命令匹配。"
  },
  "find-and-fix-a": {
    title: "找到并修复失败的测试",
    teaches: "描述症状；你不需要知道哪个文件被破坏。Claude 运行测试以查看失败，将其追踪到源中，并修复它。"
  },
  "investigate-a-reported-error": {
    title: "调查报告的错误",
    teaches: "描述症状和位置；Claude 读取相关代码路径并追踪可能的原因。如果你有堆栈跟踪或日志，请粘贴它们。",
    next: "在你的运行手册中放置一个深层链接，用此提示词预填打开 Claude"
  },
  "fix-a-build-error": {
    title: "在根处修复构建错误",
    teaches: "要求根本原因和验证可防止表面级补丁抑制错误而不修复它。"
  },
  "investigate-a-production-incident": {
    title: "调查生产事件",
    teaches: "列出要关联的证据来源，而不是要采取的步骤。Claude 一起读取日志、git 历史和配置以缩小原因。",
    next: "通过 MCP 连接 Sentry 或你的日志存储"
  },
  "query-logs-in-plain": {
    title: "用纯英文查询日志",
    teaches: "问问题而不是编写 SQL。Claude 构建查询，针对你连接的日志运行它，并显示查询和结果，以便你可以检查运行了什么。"
  },
  "diagnose-from-a-console": {
    title: "从控制台屏幕截图诊断",
    teaches: "云控制台向你显示问题，但不显示修复它的命令。Claude 读取屏幕截图并将仪表板转换为要运行的 kubectl、gcloud 或 aws 命令。"
  },
  "analyze-a-data-file": {
    title: "分析数据文件",
    teaches: "一次性问题不需要一次性脚本。指向项目文件夹中的文件，Claude 直接读取它，找到模式，并将输出写入你要求的位置。",
    next: "通过 MCP 连接数据源，而不是导出文件"
  },
  "generate-variations-from-performance": {
    title: "从性能数据生成变体",
    teaches: "在开始时说明约束，以便生成保持在限制内。Claude 读取指标，选择要替换的内容，并生成适合的替代方案。",
    next: "通过 MCP 连接广告平台，而不是导出文件"
  },
  "turn-a-recurring-task": {
    title: "将重复任务转变为技能",
    teaches: "命名步骤一次；将其重用为命令。Claude 编写任何团队成员都可以运行的 [技能](/docs/zh-CN/skills)。"
  },
  "add-a-hook-for": {
    title: "为重复行为添加钩子",
    teaches: "钩子使行为自动化，而不是你必须记住要求的东西。描述触发器和操作，Claude 编写 [钩子](/docs/zh-CN/hooks) 配置。"
  },
  "connect-a-tool-with": {
    title: "使用 MCP 连接工具",
    teaches: "连接源一次，而不是每个会话粘贴数据。在 [MCP](/docs/zh-CN/mcp) 设置后，当你询问它时，Claude 直接从工具读取。"
  },
  "capture-what-to-remember": {
    title: "捕获下次要记住的内容",
    teaches: "在你忘记之前询问。Claude 知道它在这个会话中必须弄清楚什么，并提议 [CLAUDE.md](/docs/zh-CN/memory) 条目，以便下一个会话以该上下文开始。"
  }
};

<PromptLibrary text={text} labels={labels} tagLabels={tagLabels} phaseLabels={phaseLabels} sourceLabels={sourceLabels} catLabels={catLabels} />

<h2 id="what-makes-these-prompts-work">
  这些提示词为什么有效
</h2>

上面的提示词共享一些模式。识别它们有助于你将此处的任何提示词调整到你自己的任务。

**描述结果，而不是步骤。** 说出你想要的内容，让 Claude 找到文件。下面的提示词无需命名单个文件路径即可工作。

```text theme={null}
add rate limiting to the public API and make sure existing tests still pass
```

**给它一种检查自己工作的方式。** 在同一提示词中要求运行、测试、比较或验证，以便 Claude 迭代而不是在一次尝试后停止。

```text theme={null}
write the migration, run it against the dev database, and confirm the schema matches
```

**指向参考。** 命名现有文件、测试或模式以匹配，以便新代码与你已有的内容一致。

```text theme={null}
add a settings page that follows the same layout as the profile page
```

**说明可测量的目标。** 当目标是性能或覆盖率时，给出指标和阈值，以便完成是明确的。

```text theme={null}
get the bundle size under 200KB and show me what you removed
```

**给它工件。** 直接在提示词中粘贴错误、日志、屏幕截图和计划输出，或键入 `@` 来引用文件。Claude 读取源而不是你对它的描述。

```text theme={null}
why is the build failing? @build.log
```

**说出你想要答案的方式。** 命名格式、长度或受众，以便解释适合你将如何使用它。要使格式成为每个响应的默认值，请设置 [输出样式](/docs/zh-CN/output-styles)。

```text theme={null}
explain how the payment retry logic works as an HTML page with a diagram, then open it in my browser
```

有关每个模式的更多信息，请参阅[最佳实践](/docs/zh-CN/best-practices)。

<h2 id="where-these-come-from">
  这些来自哪里
</h2>

这些提示词基于已发布的 Anthropic 资源中的模式。每张卡片都链接到其来源：

* [常见工作流](/docs/zh-CN/common-workflows)：核心任务的分步指南
* [最佳实践](/docs/zh-CN/best-practices)：提示词模式和项目设置
* [Anthropic 团队如何使用 Claude Code](https://claude.com/blog/how-anthropic-teams-use-claude-code)：来自工程、产品、设计和数据团队的真实工作流，深入探讨[法律](https://claude.com/blog/how-anthropic-uses-claude-legal)、[营销](https://claude.com/blog/how-anthropic-uses-claude-marketing)和[网络安全](https://claude.com/blog/how-anthropic-uses-claude-cybersecurity)
* [扩展代理编码指南](https://resources.anthropic.com/hubfs/Scaling%20agentic%20coding%20across%20your%20organization.pdf)：企业采用指南

有关这些模式的视频演练，请参阅 Anthropic Academy 上的免费 [Claude Code in Action](https://anthropic.skilljar.com/claude-code-in-action) 课程。

<h2 id="related-resources">
  相关资源
</h2>

此页面上的提示词是起点。一旦一个对你的项目有效，下一步是使其可重复：将其保存为 [技能](/docs/zh-CN/skills)，以便团队中的任何人都可以将其作为 `/command` 运行，并在 [CLAUDE.md](/docs/zh-CN/memory) 中记录 Claude 学到的约定，以便每个会话都以该上下文开始，而不是 Claude 重新学习它。对于更大或更危险的更改，[Plan Mode](/docs/zh-CN/permission-modes#analyze-before-you-edit-with-plan-mode) 在任何编辑发生前显示文件列表。

如果你在团队中引入 Claude Code，请参阅[管理](/docs/zh-CN/admin-setup)以获取托管设置和策略，以及[成本和使用](/docs/zh-CN/costs)以了解此工作如何在你的计划上计费。
