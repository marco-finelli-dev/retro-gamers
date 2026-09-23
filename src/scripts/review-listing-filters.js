// Progressive enhancement of the review archive's existing native controls.
const root = document.querySelector('.reviews-listing [data-archive-filters]');
if (root && !root.dataset.customFiltersInitialized) {
  const selects = [...root.querySelectorAll('select[data-filter]')];
  const bar = root.querySelector('.archive-filters__bar');
  const en = document.documentElement.lang === 'en';
  const copy = en
    ? { search: 'Search options…', empty: 'No matching options', selected: 'Selected filters:' }
    : { search: 'Cerca nelle opzioni…', empty: 'Nessuna opzione trovata', selected: 'Filtri selezionati:' };
  let opened = null;
  const entries = [];
  const triggers = document.createElement('div');
  triggers.className = 'review-filter__triggers';
  const summary = document.createElement('div');
  summary.className = 'review-filter__summary';
  summary.setAttribute('aria-live', 'polite');
  summary.hidden = true;
  const updateSummary = () => {
    const selected = entries.filter((entry) => entry.select.value);
    summary.replaceChildren();
    summary.hidden = selected.length === 0;
    if (!selected.length) return;
    const heading = document.createElement('span');
    heading.textContent = copy.selected;
    summary.append(heading);
    selected.forEach((entry) => {
      const item = document.createElement('span');
      item.textContent = `${entry.label}: ${entry.select.selectedOptions[0].textContent}`;
      summary.append(item);
    });
  };

  const close = (restoreFocus = false) => {
    if (!opened) return;
    const entry = opened;
    opened = null;
    entry.panel.hidden = true;
    entry.trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) entry.trigger.focus();
  };

  const position = (entry) => {
    const rect = entry.trigger.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(300, innerWidth - margin * 2);
    entry.panel.style.width = `${width}px`;
    entry.panel.style.left = `${Math.max(margin, Math.min(rect.left, innerWidth - width - margin))}px`;
    const below = innerHeight - rect.bottom - margin - 6;
    const above = rect.top - margin - 6;
    const height = Math.min(360, Math.max(below, above));
    entry.panel.style.maxHeight = `${height}px`;
    entry.panel.style.top = below >= Math.min(360, above)
      ? `${rect.bottom + 6}px`
      : `${Math.max(margin, rect.top - entry.panel.offsetHeight - 6)}px`;
  };

  const visibleOptions = (entry) => entry.options.filter((option) => !option.hidden);
  const focusOption = (entry, index) => {
    const options = visibleOptions(entry);
    options.forEach((option) => { option.tabIndex = -1; });
    const option = options[Math.max(0, Math.min(index, options.length - 1))];
    if (option) { option.tabIndex = 0; option.focus(); }
  };
  const sync = (entry) => {
    const option = entry.select.selectedOptions[0];
    entry.text.textContent = entry.label;
    entry.trigger.setAttribute('aria-label', entry.select.value ? `${entry.label}: ${option.textContent}` : entry.label);
    entry.trigger.dataset.active = String(Boolean(entry.select.value));
    entry.options.forEach((item) => {
      const selected = item.dataset.value === entry.select.value;
      item.setAttribute('aria-selected', String(selected));
      item.querySelector('.review-filter__check').textContent = selected ? '✓' : '';
      item.tabIndex = selected ? 0 : -1;
    });
    updateSummary();
  };
  const filter = (entry) => {
    const query = (entry.search?.value || '').trim().toLocaleLowerCase();
    entry.options.forEach((option) => { option.hidden = !option.dataset.label.toLocaleLowerCase().includes(query); });
    entry.empty.hidden = visibleOptions(entry).length > 0;
    position(entry);
  };
  const open = (entry, keyboard = false) => {
    if (opened === entry) { close(); return; }
    close();
    opened = entry;
    entry.panel.hidden = false;
    entry.trigger.setAttribute('aria-expanded', 'true');
    sync(entry);
    filter(entry);
    if (entry.search) entry.search.focus();
    else if (keyboard) focusOption(entry, visibleOptions(entry).findIndex((item) => item.dataset.value === entry.select.value));
  };

  try {
    bar.insertBefore(triggers, root.querySelector('.archive-filters__actions'));
    root.append(summary);
    selects.forEach((select) => {
      const label = select.closest('label');
      if (!label) throw new Error('Missing archive filter label');
      const name = label.querySelector('span').textContent.trim();
      const id = `review-filter-${select.dataset.filter}`;
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'review-filter__trigger';
      trigger.hidden = true;
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', id);
      const text = document.createElement('span');
      const caret = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      caret.setAttribute('viewBox', '0 0 12 12');
      caret.setAttribute('class', 'review-filter__chevron');
      caret.setAttribute('aria-hidden', 'true');
      caret.setAttribute('focusable', 'false');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'm3 4.5 3 3 3-3');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      caret.append(path);
      trigger.append(text, caret);
      const panel = document.createElement('div');
      panel.className = 'review-filter__panel';
      panel.hidden = true;
      const list = document.createElement('div');
      list.id = id;
      list.className = 'review-filter__options';
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-label', name);
      const search = select.options.length > 10 ? document.createElement('input') : null;
      if (search) {
        search.type = 'search';
        search.placeholder = copy.search;
        search.setAttribute('aria-label', `${copy.search} ${name}`);
        search.setAttribute('aria-controls', id);
        panel.append(search);
      }
      const empty = document.createElement('p');
      empty.className = 'review-filter__empty';
      empty.textContent = copy.empty;
      empty.setAttribute('role', 'status');
      empty.hidden = true;
      const entry = { select, label: name, nativeLabel: label, trigger, text, panel, list, search, empty, options: [] };
      [...select.options].forEach((option) => {
        const item = document.createElement('div');
        item.setAttribute('role', 'option');
        item.tabIndex = -1;
        item.dataset.value = option.value;
        item.dataset.label = option.textContent;
        const check = document.createElement('span');
        check.className = 'review-filter__check';
        check.setAttribute('aria-hidden', 'true');
        item.append(check, document.createTextNode(option.textContent));
        item.addEventListener('click', () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          sync(entry);
          close(true);
        });
        list.append(item);
        entry.options.push(item);
      });
      panel.append(list, empty);
      entries.push(entry);
      triggers.append(trigger);
      document.body.append(panel);
      trigger.addEventListener('click', () => open(entry, true));
      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (opened !== entry) open(entry, true);
          focusOption(entry, event.key === 'ArrowUp' ? visibleOptions(entry).length - 1 : 0);
        }
      });
      panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
        if (event.key === 'Tab') { close(true); return; }
        // Text editing keys remain native inside the search field.
        if (event.target === search) {
          if (event.key === 'ArrowDown') { event.preventDefault(); focusOption(entry, 0); }
          return;
        }
        const options = visibleOptions(entry);
        const index = options.indexOf(document.activeElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1);
          focusOption(entry, next);
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          options[index]?.click();
        }
      });
      search?.addEventListener('input', () => filter(entry));
      select.addEventListener('change', () => sync(entry));
      sync(entry);
    });

    const refreshMode = () => {
      close();
      entries.forEach((entry) => {
        entry.nativeLabel.hidden = true;
        entry.trigger.hidden = false;
        sync(entry);
      });
      root.dataset.customFilters = 'ready';
    };
    root.addEventListener('archive:filters-reset', () => {
      close();
      entries.forEach((entry) => {
        if (entry.search) entry.search.value = '';
        sync(entry);
        filter(entry);
      });
    });
    document.addEventListener('pointerdown', (event) => {
      if (opened && !opened.panel.contains(event.target) && !opened.trigger.contains(event.target)) close();
    });
    document.addEventListener('focusin', (event) => {
      if (opened && !opened.panel.contains(event.target) && !opened.trigger.contains(event.target)) close();
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && opened) close(true); });
    window.addEventListener('resize', () => { if (opened) position(opened); });
    window.addEventListener('scroll', () => { if (opened) position(opened); }, true);
    root.dataset.customFiltersInitialized = 'true';
    refreshMode();
  } catch (error) {
    entries.forEach((entry) => { entry.nativeLabel.hidden = false; entry.trigger.remove(); entry.panel.remove(); });
    triggers.remove();
    summary.remove();
    delete root.dataset.customFilters;
    console.error('Review filter enhancement unavailable; native controls retained.', error);
  }
}
