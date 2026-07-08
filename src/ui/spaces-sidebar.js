/**
 * SpaceBrowser — Sidebar UI Controller
 *
 * Manages the sidebar interface for creating, switching, and managing spaces.
 * Communicates with the background script via browser.runtime.sendMessage.
 */

(function () {
  'use strict';

  // ── DOM Elements ──
  const spaceList = document.getElementById('space-list');
  const emptyState = document.getElementById('empty-state');
  const createDialog = document.getElementById('create-dialog');
  const nameInput = document.getElementById('space-name-input');
  const colorPicker = document.getElementById('color-picker');
  const btnAdd = document.getElementById('btn-add');
  const btnCreateFirst = document.getElementById('btn-create-first');
  const btnCancel = document.getElementById('btn-cancel');
  const btnConfirm = document.getElementById('btn-confirm');

  let selectedColor = 'blue';
  let activeSpaceId = null;

  // ── Color mapping for dots ──
  const COLOR_MAP = {
    blue: '#37adff',
    turquoise: '#00c79a',
    green: '#51cd00',
    yellow: '#ffcb00',
    orange: '#ff9f00',
    red: '#ff613d',
    pink: '#ff4bda',
    purple: '#af51f5',
    toolbar: '#7c7c7d',
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  async function render() {
    const [spaces, active, tabCounts] = await Promise.all([
      msg('SPACE_LIST'),
      msg('SPACE_GET_ACTIVE'),
      msg('SPACE_TAB_COUNTS'),
    ]);

    activeSpaceId = active ? active.id : null;

    if (!spaces || spaces.length === 0) {
      spaceList.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    spaceList.style.display = 'flex';
    emptyState.style.display = 'none';

    spaceList.innerHTML = spaces
      .map((space) => {
        const isActive = space.id === activeSpaceId;
        const tabs = tabCounts[space.id] || 0;
        const dotColor = COLOR_MAP[space.color] || '#7c7c7d';
        const fpId = space.id.slice(0, 8); // Short fingerprint ID

        return `
        <div class="space-card ${isActive ? 'active' : ''}" data-id="${space.id}">
          <div class="space-dot" style="background:${dotColor};"></div>
          <div class="space-info">
            <div class="space-name">${escapeHtml(space.name)}</div>
            <div class="space-meta">
              <span class="tab-count">${tabs} tab${tabs !== 1 ? 's' : ''}</span>
              <span title="Fingerprint ID">🔑 ${fpId}</span>
            </div>
          </div>
          <div class="space-actions">
            <button class="btn-space-action" data-action="open" data-id="${space.id}" title="New tab in this space">+</button>
            <button class="btn-space-action danger" data-action="delete" data-id="${space.id}" title="Delete space">✕</button>
          </div>
        </div>`;
      })
      .join('');

    // Attach click handlers
    spaceList.querySelectorAll('.space-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        // Don't switch if clicking action buttons
        if (e.target.closest('.btn-space-action')) return;
        switchSpace(card.dataset.id);
      });
    });

    spaceList.querySelectorAll('.btn-space-action').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'open') openTab(id);
        if (action === 'delete') deleteSpace(id);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════

  async function switchSpace(spaceId) {
    await msg('SPACE_SWITCH', { spaceId });
    render();
  }

  async function openTab(spaceId) {
    await msg('SPACE_OPEN_TAB', { spaceId });
    render();
  }

  async function deleteSpace(spaceId) {
    const spaces = await msg('SPACE_LIST');
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;

    // Confirm deletion
    if (!confirm(`Delete space "${space.name}"?\n\nThis will close all tabs and delete all cookies/data in this space.`)) {
      return;
    }

    await msg('SPACE_DELETE', { spaceId });
    render();
  }

  async function createSpace() {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }

    await msg('SPACE_CREATE', { options: { name, color: selectedColor } });
    hideDialog();
    render();
  }

  // ═══════════════════════════════════════════════════════════════
  // DIALOG
  // ═══════════════════════════════════════════════════════════════

  function showDialog() {
    nameInput.value = '';
    selectedColor = 'blue';
    updateColorSelection();
    createDialog.style.display = 'flex';
    setTimeout(() => nameInput.focus(), 50);
  }

  function hideDialog() {
    createDialog.style.display = 'none';
  }

  function updateColorSelection() {
    colorPicker.querySelectorAll('.color-dot').forEach((dot) => {
      dot.classList.toggle('selected', dot.dataset.color === selectedColor);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // EVENT LISTENERS
  // ═══════════════════════════════════════════════════════════════

  btnAdd.addEventListener('click', showDialog);
  btnCreateFirst.addEventListener('click', showDialog);
  btnCancel.addEventListener('click', hideDialog);
  btnConfirm.addEventListener('click', createSpace);

  // Enter key to confirm
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createSpace();
    if (e.key === 'Escape') hideDialog();
  });

  // Color picker
  colorPicker.addEventListener('click', (e) => {
    const dot = e.target.closest('.color-dot');
    if (dot) {
      selectedColor = dot.dataset.color;
      updateColorSelection();
    }
  });

  // Close dialog on backdrop click
  createDialog.addEventListener('click', (e) => {
    if (e.target === createDialog) hideDialog();
  });

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  /** Send a message to the background script */
  function msg(type, data = {}) {
    return browser.runtime.sendMessage({ type, ...data });
  }

  /** Escape HTML to prevent XSS in rendered space names */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ═══════════════════════════════════════════════════════════════
  // AUTO-REFRESH
  // ═══════════════════════════════════════════════════════════════

  // Re-render when tabs change
  browser.tabs.onCreated.addListener(() => setTimeout(render, 300));
  browser.tabs.onRemoved.addListener(() => setTimeout(render, 300));

  // Initial render
  render();
})();
