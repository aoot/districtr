
import Tooltip from "../map/Tooltip";
import { Tab } from "../components/Tab";
import { addCOIs, opacityStyleExpression } from "../layers/COI";
import { html, directive } from "lit-html";
import { toggle } from "../components/Toggle";

/**
 * @description Gets the right checkboxes based on filtering.
 * @param {String} cluster Cluster identifier; optional.
 * @returns {HTMLElement[]} An array of filtered checkboxes.
 */
function retrieveCheckboxes(cluster=null) {
    // First, get all the checkboxes.
    let checkboxes = Array.from(document.getElementsByClassName("allvisible-checkbox"));

    // If a cluster name is passed, get only the checkbox associated to the cluster's
    // identifier, as well as that checkbox's children. Otherwise, get all the
    // checkboxes on the page.
    if (cluster) {
        checkboxes = checkboxes.concat(
            Array.from(document.getElementsByClassName(cluster))
        );
    } else {
        checkboxes = checkboxes.concat(Array.from(document.getElementsByClassName("cluster-checkbox")));
        checkboxes = checkboxes.concat(Array.from(document.getElementsByClassName("coi-checkbox")));
    }

    console.dir(checkboxes);

    // Filter to get only the checkboxes, not paragraphs with the same classes.
    return checkboxes.filter((c) => c.localName == "label");
}

/**
 * @description Tells us the status of each checkbox in the hierarchy.
 * @param {String} cluster Cluster identifier.
 * @param {String[]} cois Array of COI names.
 * @returns {Object[]} Array of objects which have a cluster ID, COI name, and checked status.
 */
function getCheckboxStatuses(cluster=null, cois=null) {
    let checkboxes = retrieveCheckboxes(cluster),
        checkboxStatuses = [],
        coiClasses = cois ? cois.map((coi) => coi.replaceAll(" ", "-")) : null;
    
    // If *any* of the checkboxes are unchecked, we can't view the things.
    // We also skip over any checkboxes whose COI names aren't included
    // in the list of COIs we're not displaying; this way, when users
    // mouse over the COIs, invisible ones don't show up.
    for (let checkbox of checkboxes) {
        // Get the name of the community of interest, and identify the two
        // conditions required to skip a checkbox: if its COI name isn't included
        // in the provided list of COI names; if it doesn't have the required
        // number of classes.
        let coi = checkbox.classList[3],
            hasEnoughClasses = checkbox.classList.length > 3,
            included = coiClasses ? coiClasses.includes(coi) : false,
            skipCondition = hasEnoughClasses && !included;

        // If the condition holds, we exclude that checkbox; otherwise, we add
        // its status to the list of statuses.
        if (skipCondition) continue;

        checkboxStatuses.push({
            "cluster": cluster,
            "coi": coi,
            "checked": checkbox.control.checked
        });
    }

    return checkboxStatuses;
}

/**
 * @description Checks if any of the boxes in the hierarchy are checked.
 * @param {String} cluster Cluster identifier.
 * @param {String[]} cois Array of COI names.
 * @returns {Boolean} Are any of the boxes in the COI's hierarchy checked?
 */
function checkIfAllVisible(cluster, cois) {
    let statuses = getCheckboxStatuses(cluster, cois),
        isChecked = true;

    for (let status of statuses) isChecked = isChecked && status["checked"];

    return isChecked;
}

function onFeatureClicked(units, unitMap, activePatternMatch, identifier="GEOID20") {
    let map = units.map,
        sourceLayer = units.sourceLayer,
        reverseMapping = createReverseMapping(unitMap);

    map.on("click", sourceLayer, (e) => {
        // Get the first selected feature belonging to the right layer, get its
        // unique identifier, find its cluster and COI name, and check if it's
        // visible. If it is, then we want to open a new window and pass the
        // information to it.
        let _selectedFeatures = map.queryRenderedFeatures(e.point),
            selectedFeatures = _selectedFeatures.map(f => {
                if (f.properties.source === sourceLayer) return f;
            }),
            feature = selectedFeatures[0],
            geoid = feature.properties[identifier],
            cluster = reverseMapping[geoid]["cluster"],
            cois = reverseMapping[geoid]["coi"],
            origin = window.location.origin;

        // Check if all the things in the hierarchy are visible. If they are,
        // and the user's clicked on the thing, we want to send the data to the
        // new page.
        if (checkIfAllVisible(cluster, cois)) {
            let tab = window.open(origin + `/coi-info/`);
            tab.coidata = {
                units: units,
                unitMap: unitMap
            };
        }
    });
}

/**
 * @description Creates a reverse mapping from units to the COIs to which they belong.
 * @param {Object} unitMap Mapping from unit names to cluster and COI names.
 * @returns {Object} Object keyed by unit unique identifier, taken to COI names.
 */
function createReverseMapping(unitMap) {
    let reverseMapping = {};

    for (let [clusterIdentifier, cluster] of Object.entries(unitMap)) {
        for (let [coiid, geoids] of Object.entries(cluster)) {
            for (let geoid of geoids) {
                let cois = [];

                // Figuring out whether we need to add new COIs to units which are
                // mapped to twice.
                if (reverseMapping[geoid]) cois = reverseMapping[geoid]["coi"].concat([coiid]);
                else cois = [coiid];

                // Add to the reverse mapping.
                reverseMapping[geoid] = {
                    "cluster": clusterIdentifier,
                    "coi": cois
                };
            }
        }
    }

    return reverseMapping;
}

/**
 * @description Creates a tooltip watcher function.
 * @param {Object} unitMap Maps cluster names to maps taking COI names to units.
 * @param {String} identifier Unique identifier for units.
 * @returns {Function} Function which renders tooltips.
 */
function watchTooltips(unitMap, identifier="GEOID20") {
    let reverseMapping = createReverseMapping(unitMap);

    return (features) => {
        // If we have no units we don't have to do anything!
        if (features.length === 0) return null;

        // Otherwise, we obtain the feature we want, get its GEOID, and check
        // whether it's visible.
        let feature = features[0],
            geoid = feature.properties[identifier];

        // Now, we want to check that the unit we're hovering over belongs to the
        // set of units in the COIs. If it does, we want to create a tooltip.
        if (reverseMapping[geoid]) {
            // For the current feature, get the cluster identifier and the COI(s)
            // to which it belongs. We also retrieve three categories of
            // checkbox: the checkbox which controls displaying *all* the COIs;
            // the checkbox which controls the display of the *cluster* of COIs;
            // the checkbox which controls the display of the *current* COIs.
            // Then, we iterate over these checkboxes and if *any* of them are
            // unchecked, we don't display the tooltip.
            let cluster = reverseMapping[geoid]["cluster"],
                cois = reverseMapping[geoid]["coi"],
                isChecked = checkIfAllVisible(cluster, cois);

            if (isChecked) {
                return html`
                    <div class="tooltip__text__small tooltip__text--column">
                        ${
                            reverseMapping[geoid]["coi"].map(
                                (d) => html`<div style="text-align: center;">${d}</div>`
                            )
                        }
                    </div>
                `;
            } else return null;
        } else return null;
    };
}

/**
 * @description Initially style the checkboxes; this is modified when COIs are displayed.
 * @returns {undefined}
 */
function initialStyles() {
    // Get all the checkboxes *except* the first one, which is always the top-level
    // one.
    let allCheckboxes = retrieveCheckboxes().slice(1);

    // Style all of the checkboxes according to the initial style rules, and
    // set the background images to their patterns.
    for (let checkbox of allCheckboxes) {
        checkbox.style["pointer-events"] = "none";
        checkbox.style["opacity"] = 1/2;
    }
}

/**
 * @description Handles turning COI viz on and off.
 * @param {Object} units Layer we're adjusting.
 * @returns {Function} Callback for Toggle.
 */
function displayCOIs(units) {
    // Destructure the COI object we get from addCOIs and find all the active
    // checkboxes to disable them.
    return (checked) => {
        let checkboxes = retrieveCheckboxes().slice(1);
        
        // Disable all the checkboxes and style them accordingly.
        for (let checkbox of checkboxes) {
            checkbox.style["pointer-events"] = checked ? "auto" : "none";
            checkbox.style["opacity"] = checked ? 1 : 1/2;
            units.setOpacity(checked ? 1/3 : 0);
        }
    };
}

/**
 * @description Adjusts the width of the tool pane to accommodate wider stuff.
 * @returns {Function} lit-html directive which adjusts the width of the tool pane.
 */
function adjustToolpaneWidth() {
    // This is a workaround for not being able to figure out how to call a
    // callback when things load. Instead, we create and immediately call a
    // directive, which resolves a Promise when the HTMLTemplateElement loads.
    // When the promise resolves, we do what we want. TODO: turn this directive
    // --> resolved Promise flow into a service, rather than reusing existing
    // code.
    return directive(promise => () => {
        Promise.resolve(promise).then(() => {
            let _toolPanes = document.getElementsByClassName("toolbar"),
                toolPanes = Array.from(_toolPanes),
                toolPane = toolPanes[0];

            // Adjust the width of the tool pane. This also gets animated because
            // the original animation was pretty chunky, so this makes it look
            // intentional.
            toolPane.style.width = "35vw";
            toolPane.style["max-width"] = "40vw";
        });
    })();
}

/**
 * @description Creates a checkbox which the user uses to turn on or off the COI display.
 * @param {Function} callback Callback function called whenever the checkbox is clicked.
 * @returns {HTMLTemplateElement} HTML template rendered to the browser, with a sneaky directive.
 */
function createCOICheckbox(callback) {
    return () => {
        let COIDisplayToggle = toggle(
                "Display Communities of Interest", false, callback, "",
                "allvisible-checkbox"
            );

        return html`
            <div class="toolbar-section">
                <div class="toolbar-inner-large" style="border-bottom: 1px solid #e0e0e0">
                    ${COIDisplayToggle}
                </div>
            </div>
            ${adjustToolpaneWidth()}
        `;
    };
}

/**
 * @descriptions Creates a renderable HTML entity for the COIs within a cluster.
 * @param {Object} cluster A cluster of COIs.
 * @param {Object} units A mapbox thing that I can't quite assign a type to.
 * @param {Object} unitMap Maps COI names to units within the cluster.
 * @param {Object} patternMatch The original mapping from COI names to patterns.
 * @returns {HTMLTemplateElement} A lit-html template element.
 */
function listCOIs(cluster, units, unitMap, patternMatch, chosenPatterns) {
    return html`
        <div class="toolbar-section-left cluster-display">
            ${
                // Here, we map over each part of the cluster -- where each
                // part is a COI -- and create a checkbox for each one. We add
                // the cluster ID and the COI name as classes to each of the
                // toggles so we can selectively en/disable them when toggling
                // further up in the hierarchy. Also get the background image
                // for 
                cluster.plan.parts.map((coi) => {
                    let adjustedClassName = coi.name.replaceAll(" ", "-"),
                        _individualCOIDisplayToggle = toggle(
                            coi.name, true,
                            toggleIndividualCOI(
                                cluster.plan.id, coi.name, units, unitMap
                            ),
                            null,
                            `coi-checkbox ${cluster.plan.id} ${adjustedClassName}`
                        ),
                        imageURL = chosenPatterns[
                            patternMatch[cluster.plan.id][coi.name]
                        ],
                        styles = `
                            background-image: url('${imageURL}');
                            height: 1em;
                            width: 3em;
                            display: block;
                            opacity: 0.6;
                            border-radius: 5px;
                            padding-right: 1em;
                        `,
                        individualCOIDisplayToggle = html`
                            <div style="display: flex; flex-direction: row; align-items: center;">
                                ${_individualCOIDisplayToggle}
                                <span style="${styles}"></span>
                            </div>
                        `;
                    
                    // Style the inner `div`s according to the same rules.
                    return html`
                        <div class="toolbar-section-left">
                            ${individualCOIDisplayToggle}
                            <p style='padding-top: 0.25rem' class='${cluster.plan.id} ${coi.name}'>${coi.description}</p>
                        </div>
                    `;
                })
            }
        </div>
    `;
}

/**
 * @description Creates a toggle for an individual COI within a cluster.
 * @param {String} cluster Name of the cluster to which the COI belongs.
 * @param {String} name Name of the individual COI.
 * @param {Object} units A mapbox thing that I can't quite assign a type to.
 * @param {Object} unitMap Maps COI names to units within the cluster.
 * @param {Object} activePatternMatch The active mapping from COI names to patterns.
 * @param {Object} patternMatch The original mapping from COI names to patterns; used to reset.
 * @returns {Function} Callback for the toggle.
 */
function toggleIndividualCOI(cluster, name, units, unitMap) {
    return (checked) => {
        // TODO: here, we have to read the statuses of *all* the checkboxes.
        // I'm faking myself out by passing the status of the checkbox to the
        // opacity style expression: that doesn't have to happen. Rather, we
        // should pass the GEOID transparency assignments *here*: based on the
        // statuses of the checkboxes, we can determine which units are transparent
        // and which aren't, then pass those units to the function which modifies
        // the units' opacities.
        // Get the geoids we're going to make transparent.
        let geoids = unitMap[cluster][name];
        opacityStyleExpression(units, geoids, checked);
    };
}

/**
 * @description Creates a toggle for an entire cluster of COIs.
 * @param {String} cluster Name of the cluster we're disabling.
 * @param {Object} units A mapbox thing that I can't quite assign a type to.
 * @param {Object} unitMap Maps COI names to units within the cluster.
 * @param {Object} activePatternMatch The active mapping from COI names to patterns.
 * @param {Object} patternMatch The original mapping from COI names to patterns; used to reset.
 * @returns {Function} Callback for the toggle.
 */
function toggleCluster(cluster, units, unitMap) {
    return (checked) => {
        // We want to preserve the status of all the units in each cluster and
        // COI -- this involves getting *all* the checkboxes' statuses and
        // setting the units' transparencies according to that.
        let statuses = getCheckboxStatuses();
        console.dir(statuses);
        
        // Do the style expression thing.
        opacityStyleExpression(units, geoids, checked);
    };
}

/**
 * @description Creates a tab on the toolbar for checking out COIs.
 * @param {Editor} editor Districtr internal Editor object.
 * @returns {undefined}
 */
function CoiVisualizationPlugin(editor) {
    let { state, toolbar, store } = editor,
        tab = new Tab("coi", "Communities", store);
    
    // Add COIs to the state.
    addCOIs(state)
        .then(object => {
            // First, create a a display callback for displaying COIs, retrieve
            // each of the necessary data-carrying things from the object returned
            // by the call to `addCOIs`, and create a *copy* of the pattern map.
            // We make a deep copy, so the copy -- which holds the state of
            // activated/deactivated COIs -- can be modified without losing the
            // original pattern assignments for the COIs.
            let { clusters, unitMap, patternMatch, units, chosenPatterns } = object,
                displayCallback = displayCOIs(units),
                tooltipCallback = watchTooltips(unitMap),
                tooltipWatcher;

            // Add the section for the checkbox.
            tab.addSection(createCOICheckbox(displayCallback));

            // For each cluster of COIs, add a dropdown section (with a checkbox
            // as its label) which allows the user to display only certain
            // clusters or certain COIs within those clusters. Unchecking any
            // cluster turns off the visualization for *any* of the COIs in the
            // cluster, and unchecking any COI only turns off the visualization
            // for that COI.
            for (let cluster of clusters) {
                let name = cluster.plan.id,
                    clusterToggle = toggle(
                        name, true,
                        toggleCluster(name, units, unitMap),
                        null, `cluster-checkbox ${name}`
                    );

                // Add a section with a toggle for a label.
                tab.addSection(
                    () => html`
                        <div class="toolbar-section-left">
                            <h4>${clusterToggle}</h4>
                            ${
                                listCOIs(
                                    cluster, units, unitMap, patternMatch,
                                    chosenPatterns
                                )
                            }
                        </div>
                    `
                );
            }

            // Add the tab to the tool pane and force a render.
            toolbar.addTab(tab);
            editor.render();

            // Initially style the checkboxes and create tooltips.
            initialStyles(patternMatch, chosenPatterns);
            tooltipWatcher = new Tooltip(units, tooltipCallback, 0);
            tooltipWatcher.activate();

            // Watch for click events.
            onFeatureClicked(units, unitMap);
        });
}

export default CoiVisualizationPlugin;
