/**
 * Renders the "Visites guidées" control panel on the /guide page.
 *
 * Reads/writes the tour state from localStorage under `dsfr-data-tours`
 * using the same schema as packages/shared/src/ui/product-tour.ts
 * (`{ disabled?: boolean, tours: { [id]: { at: ISO, version: number } } }`).
 *
 * Duplicates the storage logic deliberately: /guide is served as static HTML
 * (no bundler) so we avoid pulling the whole `@dsfr-data/shared` module just
 * for a 20-line state read/write. Keep the schema here in sync with the
 * shared module.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'dsfr-data-tours';

  // Keep this registry in sync with packages/shared/src/tour/tour-configs.ts → TOURS_REGISTRY
  var TOURS = [
    { id: 'builder', label: 'Builder', version: 1, appPath: '../apps/builder/' },
    { id: 'builder-ia', label: 'Builder IA', version: 1, appPath: '../apps/builder-ia/' },
    { id: 'builder-carto', label: 'Builder Carto', version: 1, appPath: '../apps/builder-carto/' },
    { id: 'sources', label: 'Sources', version: 1, appPath: '../apps/sources/' },
    { id: 'playground', label: 'Playground', version: 1, appPath: '../apps/playground/' },
    { id: 'dashboard', label: 'Dashboard', version: 1, appPath: '../apps/dashboard/' },
  ];

  function loadState() {
    var raw;
    try {
      raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (_e) {
      raw = null;
    }
    if (!raw || typeof raw !== 'object') return { tours: {} };
    if (raw.tours && typeof raw.tours === 'object') {
      return { disabled: raw.disabled === true, tours: raw.tours };
    }
    // Old format: flat map of tourId → ISO — normalize.
    var tours = {};
    Object.keys(raw).forEach(function (id) {
      if (typeof raw[id] === 'string') tours[id] = { at: raw[id], version: 1 };
    });
    return { tours: tours };
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_e) {
      /* quota / privacy mode — silent */
    }
    // Best-effort server sync: fire-and-forget PUT to /api/tour-state. If the
    // user is unauthenticated the request returns 401 and is silently
    // ignored. If CSRF rejects the first attempt (403), retry once with a
    // fresh token. This keeps /guide changes in sync cross-device without
    // waiting for the next app visit to run initAuth's prefetch.
    pushStateToServer(state);
  }

  var _csrfToken = null;

  function fetchCsrfToken() {
    return fetch('/api/auth/csrf', { credentials: 'include' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        _csrfToken = data && data.csrfToken ? data.csrfToken : null;
        return _csrfToken;
      })
      .catch(function () {
        return null;
      });
  }

  function putState(state, token) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-CSRF-Token'] = token;
    return fetch('/api/tour-state', {
      method: 'PUT',
      credentials: 'include',
      headers: headers,
      body: JSON.stringify(state),
    });
  }

  function pushStateToServer(state) {
    var attempt = _csrfToken ? Promise.resolve(_csrfToken) : fetchCsrfToken();
    attempt
      .then(function (token) {
        return putState(state, token);
      })
      .then(function (res) {
        if (res.status === 403) {
          // CSRF rejected (token rotated) — refetch and retry once.
          return fetchCsrfToken().then(function (t) {
            return putState(state, t);
          });
        }
        return res;
      })
      .catch(function () {
        /* offline or unauthenticated — silent */
      });
  }

  function isSeen(state, tour) {
    var entry = state.tours[tour.id];
    return !!entry && entry.version >= tour.version;
  }

  function markSeen(state, tour) {
    state.tours[tour.id] = { at: new Date().toISOString(), version: tour.version };
  }

  function markUnseen(state, tour) {
    delete state.tours[tour.id];
  }

  function renderTable() {
    var container = document.getElementById('tours-table-container');
    if (!container) return;
    var state = loadState();

    // Head
    var table = document.createElement('table');
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    ['Visite', 'Statut', 'Joue', 'Actions'].forEach(function (label) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    // Body
    var tbody = document.createElement('tbody');
    TOURS.forEach(function (tour) {
      var seen = isSeen(state, tour);
      var tr = document.createElement('tr');

      var tdLabel = document.createElement('td');
      tdLabel.textContent = tour.label;
      tr.appendChild(tdLabel);

      var tdStatus = document.createElement('td');
      var badge = document.createElement('p');
      badge.className = seen
        ? 'fr-badge fr-badge--success fr-badge--no-icon'
        : 'fr-badge fr-badge--info fr-badge--no-icon';
      badge.textContent = seen ? 'Joue' : 'Non joue';
      tdStatus.appendChild(badge);
      tr.appendChild(tdStatus);

      var tdToggle = document.createElement('td');
      var toggleId = 'tour-toggle-' + tour.id;
      var toggle = document.createElement('div');
      toggle.className = 'fr-toggle';
      var toggleInput = document.createElement('input');
      toggleInput.type = 'checkbox';
      toggleInput.className = 'fr-toggle__input';
      toggleInput.id = toggleId;
      toggleInput.checked = seen;
      toggleInput.setAttribute('aria-label', 'Marquer la visite ' + tour.label + ' comme jouee');
      toggleInput.addEventListener('change', function () {
        var current = loadState();
        if (toggleInput.checked) {
          markSeen(current, tour);
        } else {
          markUnseen(current, tour);
        }
        saveState(current);
        renderTable();
      });
      var toggleLabel = document.createElement('label');
      toggleLabel.className = 'fr-toggle__label';
      toggleLabel.setAttribute('for', toggleId);
      toggleLabel.textContent = ' ';
      toggle.appendChild(toggleInput);
      toggle.appendChild(toggleLabel);
      tdToggle.appendChild(toggle);
      tr.appendChild(tdToggle);

      var tdActions = document.createElement('td');
      var launch = document.createElement('a');
      launch.className =
        'fr-btn fr-btn--sm fr-btn--secondary fr-btn--icon-left fr-icon-compass-3-line';
      launch.href = tour.appPath + '?tour=restart';
      launch.textContent = seen ? 'Relancer' : 'Lancer';
      tdActions.appendChild(launch);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    var wrapper = document.createElement('div');
    wrapper.className = 'fr-table fr-table--no-caption';
    wrapper.appendChild(table);

    container.replaceChildren(wrapper);
  }

  function initDisabledToggle() {
    var input = document.getElementById('tours-disabled-toggle');
    if (!input) return;
    var state = loadState();
    input.checked = state.disabled === true;
    input.addEventListener('change', function () {
      var current = loadState();
      current.disabled = input.checked;
      saveState(current);
    });
  }

  function init() {
    initDisabledToggle();
    renderTable();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
