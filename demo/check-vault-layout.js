.pragma library

function findAll(item, name, found) {
    found = found || [];
    if (item.objectName === name) found.push(item);
    for (const child of item.children || []) findAll(child, name, found);
    return found;
}

function require(condition, message) {
    if (!condition) throw new Error("Vault layout: " + message);
}

function one(root, name) {
    const matches = findAll(root, name);
    require(matches.length === 1, "missing or ambiguous " + name);
    return matches[0];
}

function inside(parent, item, label) {
    const point = item.mapToItem(parent, 0, 0);
    require(item.width >= 0 && item.height > 0, label + " has invalid size");
    require(point.x >= -1 && point.y >= -1
        && point.x + item.width <= parent.width + 1
        && point.y + item.height <= parent.height + 1,
        label + " leaves its container");
}

function verify(panel) {
    const header = one(panel, "vaultHeader");
    const title = one(header, "panelHeroTitle");
    const headerActions = one(header, "vaultHeaderActions");
    require(title.width + 1 >= title.implicitWidth, "vault title is elided");
    inside(header, title, "title");
    inside(header, headerActions, "header actions");
    const titleRight = title.mapToItem(header, title.width, 0).x;
    require(titleRight <= headerActions.mapToItem(header, 0, 0).x,
        "header actions overlap the title");

    const toolbar = one(panel, "vaultQuickActions");
    for (const action of toolbar.children) {
        if (action.visible && action.width > 0) inside(toolbar, action, "toolbar action");
    }

    const filters = one(panel, "vaultFilters");
    let previousRight = 0;
    for (const name of ["folders", "organizations", "types"]) {
        const filter = one(filters, "vaultFilter_" + name);
        inside(filters, filter, name + " filter");
        require(filter.x >= previousRight - 1, "filters overlap");
        previousRight = filter.x + filter.width;
    }

    const rows = findAll(panel, "vaultItemRow");
    require(rows.length > 0, "fixture items did not render");
    for (const row of rows) {
        const labels = one(row, "vaultItemLabels");
        inside(row, labels, "item labels");
        const actions = one(row, "vaultItemActions");
        if (actions.visible) {
            inside(row, actions, "item actions");
            require(labels.mapToItem(row, labels.width, 0).x
                <= actions.mapToItem(row, 0, 0).x,
                "item actions overlap labels");
        }
    }
    console.log("DMS_VAULT_LAYOUT_PASS");
}
