/**
 * app.js - ResumeAI Main Application Logic
 */

// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
  selectedRole: 'Software Engineer',
  selectedFile: null,
  currentQuestion: 0,
  totalQuestions: 0,
  timerInterval: null,
  timerSeconds: 120,
  analysisComplete: false,
};

// ─── DOM HELPERS ──────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function show(el) { if (el) el.style.display = ''; }
function hide(el) { if (el) el.style.display = 'none'; }
function showEl(id) { show(document.getElementById(id)); }
function hideEl(id) { hide(document.getElementById(id)); }

function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.4s'; }, 2800);
  setTimeout(() => t.remove(), 3200);
}

// ─── TAB NAVIGATION ───────────────────────────────────────────────────────────
function initTabs() {
  $$('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      $$('.nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      $$('.panel').forEach(p => p.classList.remove('active'));
      document.getElementById(`panel-${target}`)?.classList.add('active');
    });
  });
}

function switchToTab(tabName) {
  $$('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  $$('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${tabName}`)?.classList.add('active');
}

// ─── FILE UPLOAD ──────────────────────────────────────────────────────────────
function initUpload() {
  const zone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('resume-file');
  const fileName = document.getElementById('file-name');

  zone.addEventListener('click', () => fileInput.click());

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
  });

  function handleFileSelect(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast('Please select a PDF file', 'error');
      return;
    }
    state.selectedFile = file;
    fileName.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    fileName.classList.add('visible');
    zone.style.borderColor = 'var(--accent-cyan)';
    zone.style.background = 'rgba(0,212,255,0.04)';
    toast(`Loaded: ${file.name}`, 'success');
  }
}

// ─── ROLE CHIPS ───────────────────────────────────────────────────────────────
function initRoleChips() {
  $$('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.selectedRole = chip.dataset.role;
    });
  });
}

// ─── LOADING ANIMATION ────────────────────────────────────────────────────────
function animateLoadingSteps() {
  const steps = $$('.load-step');
  let i = 0;
  return setInterval(() => {
    steps.forEach(s => s.classList.remove('active'));
    if (i < steps.length) {
      steps[i].classList.add('active');
      i++;
    }
  }, 700);
}

// ─── ANALYZE RESUME ───────────────────────────────────────────────────────────
async function analyzeResume(isDemo = false) {
  hideEl('upload-section');
  hideEl('results-section');
  showEl('loading-section');

  const loadingInterval = animateLoadingSteps();

  try {
    let data;

    if (isDemo) {
      const resp = await fetch('/demo-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_role: state.selectedRole }),
      });
      data = await resp.json();
    } else {
      if (!state.selectedFile) {
        clearInterval(loadingInterval);
        hideEl('loading-section');
        showEl('upload-section');
        toast('Please upload a PDF resume first', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('resume', state.selectedFile);
      formData.append('job_role', state.selectedRole);

      const resp = await fetch('/analyze', { method: 'POST', body: formData });
      data = await resp.json();
    }

    if (data.error) {
      throw new Error(data.error);
    }

    clearInterval(loadingInterval);
    hideEl('loading-section');
    showEl('results-section');

    if (isDemo) toast('🎯 Demo analysis loaded', 'success');
    else toast('✅ Resume analyzed successfully!', 'success');

    renderResults(data);
    state.analysisComplete = true;

  } catch (err) {
    clearInterval(loadingInterval);
    hideEl('loading-section');
    showEl('upload-section');
    toast(`Error: ${err.message}`, 'error');
    console.error(err);
  }
}

// ─── RENDER RESULTS ───────────────────────────────────────────────────────────
function renderResults(data) {
  // Animate score number
  animateNumber('score-number', 0, data.score, 1200);
  document.getElementById('score-role-label').textContent = data.job_role;

  // Score ring animation
  setTimeout(() => {
    const circumference = 314;
    const offset = circumference - (data.score / 100) * circumference;
    const ring = document.getElementById('ring-fill');
    if (ring) ring.style.strokeDashoffset = offset;
  }, 200);

  // Ring label
  document.getElementById('ring-label').textContent = getRating(data.score);

  // Stats
  animateNumber('stat-skills', 0, data.total_skills, 800);
  animateNumber('stat-missing', 0, (data.missing_required || []).length, 800);
  animateNumber('stat-questions', 0, data.questions_ready, 800);

  // Skills badge
  document.getElementById('skills-count-badge').textContent = `${data.total_skills} Skills`;

  // Skills grid
  renderSkillsGrid(data.found_skills);

  // Suggestions
  renderSuggestions(data.suggestions);
}

function getRating(score) {
  if (score >= 90) return '🏆';
  if (score >= 75) return '⭐';
  if (score >= 60) return '👍';
  if (score >= 45) return '📈';
  return '📚';
}

function renderSkillsGrid(foundSkills) {
  const grid = document.getElementById('skills-grid');
  grid.innerHTML = '';

  const colorMap = {
    'Programming Languages': '',
    'Web Technologies': 'purple',
    'Data & AI': 'green',
    'Cloud & DevOps': 'yellow',
    'Soft Skills': 'pink',
  };

  Object.entries(foundSkills).forEach(([category, skills]) => {
    if (!skills.length) return;
    const colorClass = colorMap[category] || '';

    const block = document.createElement('div');
    block.innerHTML = `
      <div class="skill-category-title">${category}</div>
      <div class="skill-tags">
        ${skills.map(s => `<span class="skill-tag ${colorClass}">${s}</span>`).join('')}
      </div>
    `;
    grid.appendChild(block);
  });

  if (!grid.children.length) {
    grid.innerHTML = '<p style="color:var(--text-muted)">No skills detected. Make sure your PDF text is readable.</p>';
  }
}

function renderSuggestions(suggestions) {
  const list = document.getElementById('suggestions-list');
  list.innerHTML = '';
  suggestions.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = `suggestion-item ${s.type || ''}`;
    div.style.animationDelay = `${i * 0.07}s`;
    div.innerHTML = `
      <div class="suggestion-icon">${s.icon}</div>
      <div>
        <div class="suggestion-title">${s.title}</div>
        <div class="suggestion-detail">${s.detail}</div>
      </div>
    `;
    list.appendChild(div);
  });
}

// ─── INTERVIEW ────────────────────────────────────────────────────────────────
async function startInterview() {
  try {
    const resp = await fetch('/interview/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_role: state.selectedRole }),
    });
    const data = await resp.json();

    if (data.error) throw new Error(data.error);

    state.totalQuestions = data.total_questions;
    state.currentQuestion = 0;

    hideEl('interview-intro');
    hideEl('interview-results');
    showEl('interview-session');

    // Hide feedback, show answer section
    hideEl('feedback-card');
    document.getElementById('answer-textarea').value = '';
    document.getElementById('word-count').textContent = '0 words';

    renderQuestion(data.first_question, 0);
    startTimer();

    toast('Interview started! Good luck! 🎤');
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  }
}

function renderQuestion(question, index) {
  if (!question) return;
  document.getElementById('q-num').textContent = index + 1;
  document.getElementById('q-current').textContent = index + 1;
  document.getElementById('q-total').textContent = state.totalQuestions;
  document.getElementById('q-type-badge').textContent = question.type;
  document.getElementById('question-text').textContent = question.question;

  // Progress bar
  const pct = ((index) / state.totalQuestions) * 100;
  document.getElementById('progress-fill').style.width = `${pct}%`;

  // Reset textarea and feedback
  document.getElementById('answer-textarea').value = '';
  document.getElementById('word-count').textContent = '0 words';
  hideEl('feedback-card');

  // Animate question in
  const qCard = document.querySelector('.question-card');
  if (qCard) {
    qCard.style.opacity = '0';
    qCard.style.transform = 'translateY(10px)';
    setTimeout(() => {
      qCard.style.transition = 'all 0.4s ease';
      qCard.style.opacity = '1';
      qCard.style.transform = 'translateY(0)';
    }, 50);
  }
}

function startTimer() {
  clearInterval(state.timerInterval);
  state.timerSeconds = 120;
  updateTimerDisplay();

  state.timerInterval = setInterval(() => {
    state.timerSeconds--;
    updateTimerDisplay();
    if (state.timerSeconds <= 0) {
      clearInterval(state.timerInterval);
      toast("⏰ Time's up! Submitting your answer...");
      submitAnswer();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const mins = Math.floor(state.timerSeconds / 60);
  const secs = state.timerSeconds % 60;
  const display = document.getElementById('timer-display');
  const wrapper = display?.parentElement;
  display.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

  wrapper?.classList.remove('warning', 'danger');
  if (state.timerSeconds <= 20) wrapper?.classList.add('danger');
  else if (state.timerSeconds <= 45) wrapper?.classList.add('warning');
}

async function submitAnswer() {
  clearInterval(state.timerInterval);
  const answer = document.getElementById('answer-textarea').value;

  try {
    const resp = await fetch('/interview/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer, question_index: state.currentQuestion }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    state.currentQuestion++;
    renderFeedback(data);

    if (!data.has_next) {
      document.getElementById('next-question-btn').textContent = 'View Final Results →';
      document.getElementById('next-question-btn').dataset.final = 'true';
    } else {
      document.getElementById('next-question-btn').textContent = 'Next Question →';
      document.getElementById('next-question-btn').dataset.final = '';
      document.getElementById('next-question-btn').dataset.nextQuestion = JSON.stringify(data.next_question);
      document.getElementById('next-question-btn').dataset.nextIndex = data.next_index;
    }

  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  }
}

function renderFeedback(data) {
  const eval_ = data.evaluation;
  document.getElementById('feedback-score').textContent = eval_.score;
  document.getElementById('feedback-grade').textContent = eval_.grade;
  document.getElementById('feedback-text').textContent = eval_.feedback;

  const strengths = document.getElementById('feedback-strengths');
  strengths.innerHTML = eval_.strengths.length
    ? eval_.strengths.map(s => `<li>${s}</li>`).join('')
    : '<li>Provide more specific examples</li>';

  const improvements = document.getElementById('feedback-improvements');
  improvements.innerHTML = eval_.improvements.length
    ? eval_.improvements.map(s => `<li>${s}</li>`).join('')
    : '<li>Keep practicing!</li>';

  showEl('feedback-card');

  // Scroll to feedback
  document.getElementById('feedback-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function showFinalResults() {
  try {
    const resp = await fetch('/interview/results');
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    hideEl('interview-session');
    showEl('interview-results');

    document.getElementById('results-emoji').textContent = data.emoji;
    document.getElementById('results-overall').textContent = data.overall_rating;
    document.getElementById('results-message').textContent = data.message;

    animateNumber('results-avg', 0, data.average_score, 1500);

    // Score bars
    const barsEl = document.getElementById('score-bars');
    barsEl.innerHTML = '';
    data.individual_scores.forEach((score, i) => {
      const row = document.createElement('div');
      row.className = 'score-bar-row';
      row.innerHTML = `
        <div class="score-bar-label">Q${i + 1}</div>
        <div class="score-bar-track">
          <div class="score-bar-fill" data-width="${score}" style="width:0%"></div>
        </div>
        <div class="score-bar-val">${score}</div>
      `;
      barsEl.appendChild(row);
    });

    // Animate bars
    setTimeout(() => {
      $$('.score-bar-fill').forEach(bar => {
        bar.style.width = `${bar.dataset.width}%`;
      });
    }, 200);

  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  }
}

// ─── UTILITY: Animated counter ────────────────────────────────────────────────
function animateNumber(id, from, to, duration) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = Date.now();
  const range = to - from;

  function update() {
    const elapsed = Date.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + range * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initUpload();
  initRoleChips();

  // Analyze button
  document.getElementById('analyze-btn')?.addEventListener('click', () => analyzeResume(false));
  document.getElementById('demo-btn')?.addEventListener('click', () => analyzeResume(true));

  // Go to interview
  document.getElementById('go-interview-btn')?.addEventListener('click', () => {
    switchToTab('interview');
  });
  document.getElementById('start-interview-btn')?.addEventListener('click', () => startInterview());
  document.getElementById('go-analyzer-btn')?.addEventListener('click', () => switchToTab('analyzer'));
  document.getElementById('back-analyzer-btn')?.addEventListener('click', () => switchToTab('analyzer'));

  // Submit answer
  document.getElementById('submit-answer-btn')?.addEventListener('click', () => submitAnswer());

  // Next question / final results
  document.getElementById('next-question-btn')?.addEventListener('click', (e) => {
    if (e.currentTarget.dataset.final === 'true') {
      showFinalResults();
    } else {
      const nextQ = JSON.parse(e.currentTarget.dataset.nextQuestion || 'null');
      const nextIdx = parseInt(e.currentTarget.dataset.nextIndex || '0');
      hideEl('feedback-card');
      renderQuestion(nextQ, nextIdx);
      startTimer();
      document.getElementById('answer-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  // Retry
  document.getElementById('retry-btn')?.addEventListener('click', () => {
    hideEl('interview-results');
    showEl('interview-intro');
  });

  // Word counter
  document.getElementById('answer-textarea')?.addEventListener('input', (e) => {
    const words = e.target.value.trim().split(/\s+/).filter(Boolean).length;
    const wc = document.getElementById('word-count');
    wc.textContent = `${words} word${words !== 1 ? 's' : ''}`;
    if (words >= 80) wc.style.color = 'var(--accent-green)';
    else if (words >= 40) wc.style.color = 'var(--accent-yellow)';
    else wc.style.color = 'var(--accent-cyan)';
  });

  // Keyboard shortcut: Ctrl+Enter to submit
  document.getElementById('answer-textarea')?.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') submitAnswer();
  });
});

