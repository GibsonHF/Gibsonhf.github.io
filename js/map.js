'use strict';

import { Position } from './model/Position.js';

// Import controls
import { CollectionControl } from './controls/collection_control.js';
import { CoordinatesControl } from './controls/coordinates_control.js';
import { LocalCoordinatesControl } from './controls/local_coordinates_control.js';
import { RegionBaseCoordinatesControl } from './controls/region_base_coordinates_control.js';
import { GridControl } from './controls/grid_control.js';
import { PlaneControl } from './controls/plane_control.js';
import { RegionLabelsControl } from './controls/region_labels_control.js';
import { RegionLookupControl } from './controls/region_lookup_control.js';
import { TitleLabel } from './controls/title_label.js';
import { TransportNodesControl } from './controls/transport_nodes_control.js';
import { RS3TransportControl } from './controls/rs3_transport_control.js';
import { WalkableTilesControl } from './controls/walkable_tiles_control.js';
import { LayerPanelControl } from './controls/layer_panel_control.js';
import { ContextMenuControl } from './controls/context_menu_control.js';
import { DistanceToolControl } from './controls/distance_tool_control.js';

// Copy to clipboard utility
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        } catch (e) {
            document.body.removeChild(textarea);
            return false;
        }
    }
}

// Toast notification system
function showToast(message, type = 'success', duration = 2000) {
    // Remove existing toast
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 200);
    }, duration);
}

$(document).ready(function () {
    const map = L.map.gameMap('map', {
        maxBounds: [[-1000, -1000], [13800, 13800]],
        maxBoundsViscosity: 0.5,
        customZoomControl: true,
        fullscreenControl: true,
        planeControl: true,
        positionControl: true,
        messageBox: true,
        rect: true,
        initialMapId: -1,
        plane: 0,
        x: 3200,
        y: 3200,
        minPlane: 0,
        maxPlane: 3,
        minZoom: -4,
        maxZoom: 4,
        doubleClickZoom: false,
        loadMapData: true,
        showMapBorder: true,
        enableUrlLocation: true,
        baseMaps: 'https://raw.githubusercontent.com/mejrs/data_rs3/master/basemaps.json',
    });

    // Map squares layer
    const mapLayer = L.tileLayer.main('https://raw.githubusercontent.com/mejrs/layers_rs3/master/map_squares/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
        minZoom: -4,
        maxNativeZoom: 3,
        maxZoom: 4,
    }).addTo(map);

    // Icons layer (pre-rendered, all icons)
    const iconLayer = L.tileLayer.main('https://raw.githubusercontent.com/mejrs/layers_rs3/master/icon_squares/{mapId}/{zoom}/{plane}_{x}_{y}.png', {
        minZoom: -4,
        maxNativeZoom: 3,
        maxZoom: 4,
    }).addTo(map);

    map.getContainer().focus();

    // Add basic controls
    map.addControl(new TitleLabel());
    map.addControl(new CoordinatesControl());
    map.addControl(new RegionBaseCoordinatesControl());
    map.addControl(new LocalCoordinatesControl());
    map.addControl(L.control.zoom());
    map.addControl(new PlaneControl());
    map.addControl(new CollectionControl({ position: 'topright' }));
    map.addControl(new RegionLookupControl());

    // Create controls that will be managed by the layer panel
    const gridControl = new GridControl();
    const regionLabelsControl = new RegionLabelsControl();
    const walkableControl = new WalkableTilesControl();
    const transportControl = new TransportNodesControl();
    const rs3TransportControl = new RS3TransportControl();

    // Add controls to map (they won't show their own UI)
    map.addControl(gridControl);
    map.addControl(regionLabelsControl);
    map.addControl(walkableControl);
    map.addControl(transportControl);
    map.addControl(rs3TransportControl);

    // Add context menu (right-click)
    map.addControl(new ContextMenuControl({
        rs3TransportControl: rs3TransportControl,
        transportControl: transportControl,
    }));

    // Add distance measuring tool
    const distanceToolControl = new DistanceToolControl({
        walkableControl: walkableControl,
    });
    map.addControl(distanceToolControl);

    // Add the unified layer panel control
    map.addControl(new LayerPanelControl({
        position: 'topright',
        mapLayer: mapLayer,
        iconLayer: iconLayer,
        walkableControl: walkableControl,
        transportControl: transportControl,
        rs3TransportControl: rs3TransportControl,
        gridControl: gridControl,
        regionLabelsControl: regionLabelsControl,
    }));

    // Mouse position indicator
    let prevMouseRect, prevMousePos;
    let currentMousePos = null;

    map.on('mousemove', function (e) {
        const mousePos = Position.fromLatLng(e.latlng, map.getPlane());
        currentMousePos = mousePos;

        if (prevMousePos !== mousePos) {
            prevMousePos = mousePos;
            if (prevMouseRect !== undefined) {
                map.removeLayer(prevMouseRect);
            }

            prevMouseRect = mousePos.toLeaflet();
            prevMouseRect.addTo(map);
        }
    });

    // Keyboard shortcuts for navigation
    const PAN_AMOUNT = 100;
    const ZOOM_KEYS = { '+': 1, '=': 1, '-': -1, '_': -1 };

    document.addEventListener('keydown', function (e) {
        // Don't capture if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            return;
        }

        const key = e.key;

        // Arrow keys for panning
        if (key === 'ArrowUp' || key === 'w' || key === 'W') {
            e.preventDefault();
            map.panBy([0, -PAN_AMOUNT]);
        } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
            e.preventDefault();
            map.panBy([0, PAN_AMOUNT]);
        } else if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
            e.preventDefault();
            map.panBy([-PAN_AMOUNT, 0]);
        } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
            e.preventDefault();
            map.panBy([PAN_AMOUNT, 0]);
        }
        // +/- for zoom
        else if (ZOOM_KEYS[key] !== undefined) {
            e.preventDefault();
            map.setZoom(map.getZoom() + ZOOM_KEYS[key]);
        }
        // Number keys 0-3 for plane selection
        else if (key >= '0' && key <= '3') {
            e.preventDefault();
            const plane = parseInt(key);
            map.setPlane(plane);
            showToast(`Plane ${plane}`, 'success', 1000);
        }
        // 'C' to copy coordinates at cursor
        else if ((key === 'c' || key === 'C') && currentMousePos) {
            e.preventDefault();
            const coordText = `${currentMousePos.x}, ${currentMousePos.y}, ${currentMousePos.plane}`;
            copyToClipboard(coordText).then(success => {
                if (success) {
                    showToast(`Copied: ${coordText}`, 'success');
                }
            });
        }
        // 'G' to toggle grid
        else if (key === 'g' || key === 'G') {
            e.preventDefault();
            gridControl.toggle();
            showToast(gridControl.isEnabled() ? 'Grid enabled' : 'Grid disabled', 'success', 1000);
        }
        // 'L' to toggle layer panel
        else if (key === 'l' || key === 'L') {
            e.preventDefault();
            const panel = document.querySelector('.layer-panel-content');
            const toggle = document.querySelector('.layer-panel-toggle');
            if (panel && toggle) {
                panel.classList.toggle('visible');
                toggle.classList.toggle('active');
            }
        }
        // 'M' to toggle distance measuring tool
        else if (key === 'm' || key === 'M') {
            e.preventDefault();
            distanceToolControl.toggle();
            showToast(distanceToolControl.isEnabled() ? 'Distance tool enabled' : 'Distance tool disabled', 'success', 1000);
        }
        // '?' to show help and settings
        else if (key === '?') {
            e.preventDefault();
            showHelpAndSettings();
        }
    });

    // Help & Settings modal
    function showHelpAndSettings() {
        Swal.fire({
            title: 'Map Help & Settings',
            html: `
                <div class="settings-modal">
                    <div class="settings-section">
                        <h3 class="settings-section-title">Keyboard Shortcuts</h3>
                        <div class="shortcuts-grid">
                            <div><kbd>Arrow Keys</kbd> or <kbd>WASD</kbd></div><div>Pan map</div>
                            <div><kbd>+</kbd> / <kbd>-</kbd></div><div>Zoom in/out</div>
                            <div><kbd>0</kbd> - <kbd>3</kbd></div><div>Switch plane</div>
                            <div><kbd>C</kbd></div><div>Copy coordinates at cursor</div>
                            <div><kbd>G</kbd></div><div>Toggle grid</div>
                            <div><kbd>L</kbd></div><div>Toggle layer panel</div>
                            <div><kbd>M</kbd></div><div>Distance measuring tool</div>
                            <div><kbd>Right-click</kbd></div><div>Context menu</div>
                            <div><kbd>?</kbd></div><div>Show this help</div>
                        </div>
                    </div>

                    <div class="settings-section">
                        <h3 class="settings-section-title">About</h3>
                        <p class="settings-about">
                            RS3 interactive map with transport nodes and walkable tiles data.
                        </p>
                    </div>
                </div>
            `,
            showCloseButton: true,
            showConfirmButton: false,
            background: '#161b22',
            color: '#e6edf3',
            width: '480px',
        });
    }

    // Add settings button to page
    const settingsButton = document.createElement('button');
    settingsButton.className = 'help-button';
    settingsButton.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>';
    settingsButton.title = 'Help & Settings (Press ?)';
    settingsButton.addEventListener('click', showHelpAndSettings);
    document.body.appendChild(settingsButton);
});
