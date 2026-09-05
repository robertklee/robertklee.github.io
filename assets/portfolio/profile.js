(() => {
  'use strict';

  const sourceURL = new URL('../../index.html', document.currentScript.src);
  const content = document.getElementById('profile-content');
  const loading = document.getElementById('profile-loading');
  const errorPanel = document.getElementById('profile-error');
  const expandButton = document.getElementById('profile-expand');

  function syncExpandButton() {
    const details = [...content.querySelectorAll('.cv-details')];
    const allOpen = details.length > 0 && details.every(detail => detail.open);
    const icon = document.createElement('span');
    icon.textContent = allOpen ? '\u2212' : '+';
    icon.setAttribute('aria-hidden', 'true');
    expandButton.replaceChildren(document.createTextNode(allOpen ? 'Collapse all details ' : 'Expand all details '), icon);
  }

  function hydrateProfile() {
    content.querySelectorAll('.cv-details').forEach(details => details.addEventListener('toggle', syncExpandButton));
    for (const section of ['work', 'projects', 'leadership', 'education']) {
      const count = content.querySelectorAll(`.cv-record-${section}`).length;
      document.querySelectorAll(`[data-profile-count="${section}"]`).forEach(label => { label.textContent = count; });
    }
    loading.hidden = true;
    errorPanel.hidden = true;
    content.setAttribute('aria-busy', 'false');
    expandButton.disabled = false;
    syncExpandButton();
    document.dispatchEvent(new Event('profile-ready'));
  }

  async function loadProfile() {
    loading.hidden = false;
    errorPanel.hidden = true;
    content.setAttribute('aria-busy', 'true');
    const response = await fetch(sourceURL);
    if (!response.ok) throw new Error(`Profile request failed: HTTP ${response.status}.`);
    const source = new DOMParser().parseFromString(await response.text(), 'text/html');
    const sections = [...source.querySelectorAll('#profile-content > .cv-section')];
    if (sections.length !== 6) throw new Error('The complete profile could not be found.');
    const fragment = document.createDocumentFragment();
    sections.forEach(section => {
      const copy = document.importNode(section, true);
      copy.querySelectorAll('[src], [href]').forEach(node => {
        for (const attribute of ['src', 'href']) {
          const value = node.getAttribute(attribute);
          if (value && !value.startsWith('#')) node.setAttribute(attribute, new URL(value, sourceURL).href);
        }
      });
      fragment.append(copy);
    });
    content.append(fragment);
    hydrateProfile();
  }

  function showLoadError(error) {
    console.error('Unable to load the full profile:', error);
    loading.hidden = true;
    errorPanel.hidden = false;
    content.setAttribute('aria-busy', 'false');
    errorPanel.querySelector('p').textContent = `The full profile could not be loaded. ${error.message}`;
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-profile-resume]')) {
      window.open(atob('L3IvZG9jcy9kb2MtNTYzNGZjMmY0NmUzNTU0NjJmM2YwMGVhNDIyYWIxMzMucGRm'), '_blank', 'noopener,noreferrer');
    }
  });
  expandButton.addEventListener('click', () => {
    const details = [...content.querySelectorAll('.cv-details')];
    const shouldOpen = !details.every(detail => detail.open);
    details.forEach(detail => { detail.open = shouldOpen; });
    syncExpandButton();
  });
  document.getElementById('profile-retry').addEventListener('click', () => loadProfile().catch(showLoadError));
  if (content.querySelector('.cv-section')) hydrateProfile();
  else loadProfile().catch(showLoadError);
})();
