'use strict';

import Locations from '../model/Locations.js';

export var LocationSearchControl = L.Control.extend({
    options: {
        position: 'topleft',
    },

    onAdd: function (map) {
        this._map = map;
        this._results = [];
        this._resultIndex = 0;
        this._searchMarker = null;
        this._debounceTimer = null;

        const container = L.DomUtil.create('div', 'location-search-control');

        // Search input row
        const inputRow = L.DomUtil.create('div', 'location-search-row', container);

        const searchIcon = L.DomUtil.create('span', 'location-search-icon', inputRow);
        searchIcon.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

        this._input = L.DomUtil.create('input', 'location-search-input', inputRow);
        this._input.type = 'text';
        this._input.placeholder = 'Search location…';
        this._input.autocomplete = 'off';
        this._input.spellcheck = false;

        this._clearBtn = L.DomUtil.create('button', 'location-search-clear', inputRow);
        this._clearBtn.innerHTML = '✕';
        this._clearBtn.title = 'Clear search';
        this._clearBtn.style.display = 'none';

        // Results dropdown
        this._dropdown = L.DomUtil.create('div', 'location-search-dropdown', container);
        this._dropdown.style.display = 'none';

        // Navigation bar (shown when multiple results)
        this._navBar = L.DomUtil.create('div', 'location-search-nav', container);
        this._navBar.style.display = 'none';

        this._navPrev = L.DomUtil.create('button', 'location-search-nav-btn', this._navBar);
        this._navPrev.innerHTML = '‹ Prev';

        this._navLabel = L.DomUtil.create('span', 'location-search-nav-label', this._navBar);

        this._navNext = L.DomUtil.create('button', 'location-search-nav-btn', this._navBar);
        this._navNext.innerHTML = 'Next ›';

        // Event listeners
        L.DomEvent.on(this._input, 'input', this._onInput, this);
        L.DomEvent.on(this._input, 'keydown', this._onKeyDown, this);
        L.DomEvent.on(this._input, 'focus', () => {
            if (this._results.length > 0) this._showDropdown();
        });

        L.DomEvent.on(this._clearBtn, 'click', this._clear, this);
        L.DomEvent.on(this._navPrev, 'click', this._prevResult, this);
        L.DomEvent.on(this._navNext, 'click', this._nextResult, this);

        // Close dropdown on map click
        map.on('click', () => this._hideDropdown());

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        // Preload locations
        Locations.getLocations(function () {});

        return container;
    },

    focus: function () {
        if (this._input) {
            this._input.focus();
            this._input.select();
        }
    },

    _onInput: function () {
        const val = this._input.value.trim();
        this._clearBtn.style.display = val ? '' : 'none';

        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => this._search(val), 120);
    },

    _search: function (term) {
        if (!term || term.length < 2) {
            this._results = [];
            this._hideDropdown();
            this._hideNav();
            return;
        }

        const lower = term.toLowerCase();
        Locations.getLocations((locations) => {
            this._results = locations.filter(loc =>
                loc.name.toLowerCase().includes(lower)
            );
            this._resultIndex = 0;
            this._renderDropdown(lower);
        });
    },

    _renderDropdown: function (highlight) {
        this._dropdown.innerHTML = '';

        if (this._results.length === 0) {
            const empty = L.DomUtil.create('div', 'location-search-empty', this._dropdown);
            empty.textContent = 'No results';
            this._showDropdown();
            this._hideNav();
            return;
        }

        const MAX_SHOWN = 10;
        const shown = this._results.slice(0, MAX_SHOWN);

        shown.forEach((loc, idx) => {
            const item = L.DomUtil.create('div', 'location-search-item', this._dropdown);
            if (idx === this._resultIndex) item.classList.add('active');

            const nameEl = L.DomUtil.create('span', 'location-search-item-name', item);
            nameEl.innerHTML = this._highlightMatch(loc.name, highlight);

            const coordEl = L.DomUtil.create('span', 'location-search-item-coord', item);
            coordEl.textContent = `${loc.position.x}, ${loc.position.y}`;

            const sizeEl = L.DomUtil.create('span', `location-search-item-size size-${loc.size}`, item);
            sizeEl.textContent = loc.size;

            L.DomEvent.on(item, 'click', () => {
                this._resultIndex = idx;
                this._goToResult(idx);
            });
        });

        if (this._results.length > MAX_SHOWN) {
            const more = L.DomUtil.create('div', 'location-search-more', this._dropdown);
            more.textContent = `+${this._results.length - MAX_SHOWN} more — refine search`;
        }

        this._showDropdown();

        if (this._results.length > 1) {
            this._updateNavLabel();
            this._navBar.style.display = '';
        } else {
            this._hideNav();
        }
    },

    _highlightMatch: function (name, term) {
        if (!term) return name;
        const idx = name.toLowerCase().indexOf(term.toLowerCase());
        if (idx === -1) return name;
        return name.slice(0, idx) +
            `<mark>${name.slice(idx, idx + term.length)}</mark>` +
            name.slice(idx + term.length);
    },

    _goToResult: function (idx) {
        if (!this._results.length) return;
        idx = ((idx % this._results.length) + this._results.length) % this._results.length;
        this._resultIndex = idx;
        const loc = this._results[idx];

        this._clearMarker();

        const latLng = loc.position.toCentreLatLng(this._map);
        this._searchMarker = L.marker(latLng).addTo(this._map);
        this._searchMarker.once('click', () => this._clearMarker());

        this._map.panTo(latLng);

        if (this._map.plane !== loc.position.z) {
            this._map.setPlane(loc.position.z);
        }

        if (this._results.length > 1) {
            this._updateNavLabel();
        }

        // Highlight active item in dropdown
        const items = this._dropdown.querySelectorAll('.location-search-item');
        items.forEach((el, i) => el.classList.toggle('active', i === idx));
    },

    _prevResult: function () {
        this._goToResult(this._resultIndex - 1);
    },

    _nextResult: function () {
        this._goToResult(this._resultIndex + 1);
    },

    _updateNavLabel: function () {
        this._navLabel.textContent = `${this._resultIndex + 1} / ${this._results.length}`;
    },

    _onKeyDown: function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (this._results.length > 0) {
                this._goToResult(this._resultIndex);
                this._hideDropdown();
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (this._results.length > 0) {
                this._goToResult(this._resultIndex + 1);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (this._results.length > 0) {
                this._goToResult(this._resultIndex - 1);
            }
        } else if (e.key === 'Escape') {
            this._clear();
        }
    },

    _clear: function () {
        this._input.value = '';
        this._clearBtn.style.display = 'none';
        this._results = [];
        this._resultIndex = 0;
        this._hideDropdown();
        this._hideNav();
        this._clearMarker();
        this._input.focus();
    },

    _clearMarker: function () {
        if (this._searchMarker) {
            this._map.removeLayer(this._searchMarker);
            this._searchMarker = null;
        }
    },

    _showDropdown: function () {
        this._dropdown.style.display = '';
    },

    _hideDropdown: function () {
        this._dropdown.style.display = 'none';
    },

    _hideNav: function () {
        this._navBar.style.display = 'none';
    },
});
