/* eslint-disable linebreak-style */
import { html } from "lit-html";

import { actions } from "../../reducers/charts";

export default function CutEdgesSection(state, uiState, dispatch) {
  let numCutEdges = 0;

  let cutEdges = [];

  return html`
    <section class="toolbar-section">
      <h4>
        Number of cut edges:
      </h4>

      <span id="num-cut-edges"> ${numCutEdges} </span>

      <h4>
        Number of cut edges compared to 50,000 plans under Recom step:
      </h4>
      <div id="cut_edges_distribution">
        <canvas id="cut_edges_distrib_canvas"></canvas>
      </div>

      <h4>
        List of cut edges:
      </h4>

      <span id="cut-edges"> ${cutEdges} </span>
    </section>
  `;
}
