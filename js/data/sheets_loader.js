'use strict';

const SHEET_ID = '1gp1fePtecvpU1u-WhZk-uKm-wLiDcYB0LkmtaKOiPwo';

const SHEETS = {
    doors: 'teleports_door_nodes',
    items: 'teleports_item_nodes',
    npcs: 'teleports_npc_nodes',
    objects: 'teleports_object_nodes',
    fairy_rings: 'teleports_fairy_rings_nodes',
    lodestones: 'teleports_lodestone_nodes',
};

let transportDataCache = null;
let transportDataPromise = null;

function buildSheetUrl(sheetName) {
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

function parseCsv(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((header, index) => {
            let value = values[index] || '';
            // Remove surrounding quotes
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            // Try to convert to number if it looks like one
            if (value !== '' && !isNaN(value)) {
                row[header] = Number(value);
            } else {
                row[header] = value;
            }
        });
        rows.push(row);
    }

    return rows;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());

    return result;
}

async function fetchSheet(sheetName) {
    const response = await fetch(buildSheetUrl(sheetName));
    if (!response.ok) {
        throw new Error(`Failed to fetch ${sheetName}`);
    }
    const text = await response.text();
    return parseCsv(text);
}

export function loadTransportData() {
    if (transportDataCache) {
        return Promise.resolve(transportDataCache);
    }

    if (transportDataPromise) {
        return transportDataPromise;
    }

    transportDataPromise = loadAllSheets()
        .then(data => {
            transportDataCache = data;
            return data;
        })
        .catch(error => {
            console.error('Failed to load transport data:', error);
            transportDataPromise = null;
            throw error;
        });

    return transportDataPromise;
}

async function loadAllSheets() {
    const [doors, items, npcs, objects, fairyRings, lodestones] = await Promise.all([
        fetchSheet(SHEETS.doors),
        fetchSheet(SHEETS.items),
        fetchSheet(SHEETS.npcs),
        fetchSheet(SHEETS.objects),
        fetchSheet(SHEETS.fairy_rings),
        fetchSheet(SHEETS.lodestones),
    ]);

    const nodesByPlane = new Map();
    const doorNodeMap = new Map();
    const itemNodeMap = new Map();
    const npcNodeMap = new Map();
    const objectNodeMap = new Map();
    const fairyRingNodeMap = new Map();
    const lodestoneNodeMap = new Map();

    // Process door nodes
    doors.forEach(row => {
        if (!row.id) return;

        doorNodeMap.set(row.id, {
            direction: row.direction || '',
            real_id_open: row.real_id_open,
            real_id_closed: row.real_id_closed,
            open_action: row.open_action || 'Open',
        });

        const srcX = row.tile_inside_x;
        const srcY = row.tile_inside_y;
        const srcPlane = row.tile_inside_plane || 0;
        const dstX = row.tile_outside_x;
        const dstY = row.tile_outside_y;
        const dstPlane = row.tile_outside_plane || 0;

        if (srcX === undefined || srcY === undefined) return;

        addNode(nodesByPlane, {
            id: row.id,
            kind: 'door',
            x: srcX,
            y: srcY,
            plane: srcPlane,
            dst_x: dstX,
            dst_y: dstY,
            dst_plane: dstPlane,
            detail: doorNodeMap.get(row.id),
        });
    });

    // Process item nodes
    items.forEach(row => {
        if (!row.id) return;

        itemNodeMap.set(row.id, {
            name: row.name || row.INFO || `Item #${row.item_id}`,
            item_id: row.item_id,
            action: row.action || 'Teleport',
            dest_min_x: row.dest_min_x,
            dest_max_x: row.dest_max_x,
            dest_min_y: row.dest_min_y,
            dest_max_y: row.dest_max_y,
            dest_plane: row.dest_plane || 0,
        });

        // Items don't have a fixed source location - they're inventory items
        // Show them at their destination
        const destX = (row.dest_min_x + row.dest_max_x) / 2;
        const destY = (row.dest_min_y + row.dest_max_y) / 2;
        const destPlane = row.dest_plane || 0;

        if (!destX || !destY) return;

        addNode(nodesByPlane, {
            id: row.id,
            kind: 'item',
            x: destX,
            y: destY,
            plane: destPlane,
            dst_x: destX,
            dst_y: destY,
            dst_plane: destPlane,
            detail: itemNodeMap.get(row.id),
            shadow: true,
            shadowFromZero: true,
        });
    });

    // Process NPC nodes
    npcs.forEach(row => {
        if (!row.id) return;

        npcNodeMap.set(row.id, {
            npc_id: row.npc_id,
            npc_name: row.npc_name || `NPC #${row.npc_id}`,
            action: row.action || 'Talk-to',
            dest_min_x: row.dest_min_x,
            dest_max_x: row.dest_max_x,
            dest_min_y: row.dest_min_y,
            dest_max_y: row.dest_max_y,
            dest_plane: row.dest_plane || 0,
        });

        const srcX = (row.orig_min_x + row.orig_max_x) / 2;
        const srcY = (row.orig_min_y + row.orig_max_y) / 2;
        const srcPlane = row.orig_plane || 0;
        const dstX = (row.dest_min_x + row.dest_max_x) / 2;
        const dstY = (row.dest_min_y + row.dest_max_y) / 2;
        const dstPlane = row.dest_plane || 0;

        if (!srcX || !srcY) return;

        addNode(nodesByPlane, {
            id: row.id,
            kind: 'npc',
            x: srcX,
            y: srcY,
            plane: srcPlane,
            dst_x: dstX,
            dst_y: dstY,
            dst_plane: dstPlane,
            detail: npcNodeMap.get(row.id),
        });
    });

    // Process object nodes
    objects.forEach(row => {
        if (!row.id) return;

        objectNodeMap.set(row.id, {
            object_id: row.object_id,
            object_name: row.object_name || `Object #${row.object_id}`,
            action: row.action || 'Use',
            dest_min_x: row.dest_min_x,
            dest_max_x: row.dest_max_x,
            dest_min_y: row.dest_min_y,
            dest_max_y: row.dest_max_y,
            dest_plane: row.dest_plane || 0,
        });

        const srcX = (row.orig_min_x + row.orig_max_x) / 2;
        const srcY = (row.orig_min_y + row.orig_max_y) / 2;
        const srcPlane = row.orig_plane || 0;
        const dstX = (row.dest_min_x + row.dest_max_x) / 2;
        const dstY = (row.dest_min_y + row.dest_max_y) / 2;
        const dstPlane = row.dest_plane || 0;

        if (!srcX || !srcY) return;

        addNode(nodesByPlane, {
            id: row.id,
            kind: 'object',
            x: srcX,
            y: srcY,
            plane: srcPlane,
            dst_x: dstX,
            dst_y: dstY,
            dst_plane: dstPlane,
            detail: objectNodeMap.get(row.id),
        });
    });

    // Process fairy ring nodes
    fairyRings.forEach(row => {
        if (!row.id) return;

        fairyRingNodeMap.set(row.id, {
            object_id: row.object_id,
            x: row.x,
            y: row.y,
            plane: row.plane || 0,
            code: row.code || '',
            action: row.action || 'Use',
        });

        addNode(nodesByPlane, {
            id: row.id,
            kind: 'fairy_ring',
            x: row.x,
            y: row.y,
            plane: row.plane || 0,
            dst_x: row.x,
            dst_y: row.y,
            dst_plane: row.plane || 0,
            detail: fairyRingNodeMap.get(row.id),
        });
    });

    // Process lodestone nodes
    lodestones.forEach(row => {
        if (!row.id) return;

        lodestoneNodeMap.set(row.id, {
            lodestone: row.lodestone,
            dest_x: row.dest_x,
            dest_y: row.dest_y,
            dest_plane: row.dest_plane || 0,
        });

        // Lodestones are shown at their destination
        addNode(nodesByPlane, {
            id: row.id,
            kind: 'lodestone',
            x: row.dest_x,
            y: row.dest_y,
            plane: row.dest_plane || 0,
            dst_x: row.dest_x,
            dst_y: row.dest_y,
            dst_plane: row.dest_plane || 0,
            detail: lodestoneNodeMap.get(row.id),
        });
    });

    console.log('Transport data loaded from Google Sheets:');
    console.log(`  doors: ${doorNodeMap.size}`);
    console.log(`  items: ${itemNodeMap.size}`);
    console.log(`  npcs: ${npcNodeMap.size}`);
    console.log(`  objects: ${objectNodeMap.size}`);
    console.log(`  fairy_rings: ${fairyRingNodeMap.size}`);
    console.log(`  lodestones: ${lodestoneNodeMap.size}`);

    return {
        nodesByPlane,
        doorNodeMap,
        itemNodeMap,
        npcNodeMap,
        objectNodeMap,
        fairyRingNodeMap,
        lodestoneNodeMap,
    };
}

function addNode(nodesByPlane, node) {
    const plane = node.plane;

    if (!nodesByPlane.has(plane)) {
        nodesByPlane.set(plane, []);
    }
    nodesByPlane.get(plane).push(node);

    // Add shadow node if destination is on different plane
    if (node.dst_plane !== undefined && node.dst_plane !== plane && !node.shadow) {
        if (!nodesByPlane.has(node.dst_plane)) {
            nodesByPlane.set(node.dst_plane, []);
        }
        nodesByPlane.get(node.dst_plane).push({
            ...node,
            plane: node.dst_plane,
            shadow: true,
        });
    }
}

export function clearTransportCache() {
    transportDataCache = null;
    transportDataPromise = null;
}

// RS3 Transport Data loading (from local JSON file)
let rs3TransportCache = null;
let rs3TransportPromise = null;

export function loadRS3TransportData() {
    if (rs3TransportCache) {
        return Promise.resolve(rs3TransportCache);
    }

    if (rs3TransportPromise) {
        return rs3TransportPromise;
    }

    rs3TransportPromise = fetch('resources/rs3_transport_data.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch RS3 transport data');
            }
            return response.json();
        })
        .then(data => {
            rs3TransportCache = data;
            console.log(`RS3 transport data loaded: ${data.length} entries`);
            return data;
        })
        .catch(error => {
            console.error('Failed to load RS3 transport data:', error);
            rs3TransportPromise = null;
            throw error;
        });

    return rs3TransportPromise;
}

export function clearRS3TransportCache() {
    rs3TransportCache = null;
    rs3TransportPromise = null;
}
