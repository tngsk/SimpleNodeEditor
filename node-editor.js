// node-editor.js
class NodeEditor {
    constructor(containerId, schema) {
        this.container = document.getElementById(containerId);
        this.schema = schema;
        this.nodeTypes = {}; // Flat dictionary of node types from schema

        if (this.schema) {
            this._parseSchema();
            this._buildPalette();
        }

        // Create SVG layer for lines
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.id = "svg-layer";
        this.container.appendChild(this.svg);

        this.nodes = {}; // Store node data: { id: { element, type, inputs, outputs, parameters, x, y } }
        this.connections = []; // Array of { fromNode, fromPort, toNode, toPort, assetKey }

        // Drag state
        this.draggingNode = null;
        this.draggingPort = null;
        this.startPos = { x: 0, y: 0 };
        this.lineTemp = null;

        this.nodeCounter = 0;

        this._bindEvents();
    }

    _parseSchema() {
        if (!this.schema || !this.schema.categories) return;
        this.schema.categories.forEach(category => {
            category.nodes.forEach(nodeDef => {
                this.nodeTypes[nodeDef.type] = nodeDef;
            });
        });
    }

    _buildPalette() {
        const paletteContent = document.getElementById("palette-content");
        if (!paletteContent || !this.schema) return;

        this.schema.categories.forEach(category => {
            const catEl = document.createElement("div");
            catEl.innerHTML = `<h4 style="margin: 10px 0 5px;">${category.name}</h4>`;
            category.nodes.forEach(nodeDef => {
                const btn = document.createElement("button");
                btn.innerText = nodeDef.name;
                btn.className = "palette-btn";
                btn.style.display = "block";
                btn.style.width = "100%";
                btn.style.marginBottom = "5px";
                btn.style.padding = "5px";
                btn.style.cursor = "pointer";
                btn.onclick = () => {
                    this.addNodeFromSchema(nodeDef.type, 250, 100);
                };
                catEl.appendChild(btn);
            });
            paletteContent.appendChild(catEl);
        });
    }

    _bindEvents() {
        document.addEventListener("mousedown", (e) => {
            // Check if click was inside this container
            if (!this.container.contains(e.target)) return;

            // Node dragging
            const nodeEl = e.target.closest('.node');
            if (nodeEl && !e.target.classList.contains('node-delete-btn') && !e.target.classList.contains('port')) {
                this.draggingNode = nodeEl;
                this.startPos = {
                    x: e.clientX - this.draggingNode.offsetLeft,
                    y: e.clientY - this.draggingNode.offsetTop,
                };
            }
            // Port dragging (from 'out' port)
            else if (e.target.classList.contains("port") && e.target.dataset.type === "out") {
                this.draggingPort = e.target;
                const rect = this.draggingPort.getBoundingClientRect();
                this.lineTemp = {
                    x1: rect.left + 6,
                    y1: rect.top + 6,
                    x2: e.clientX,
                    y2: e.clientY,
                };
            }
        });

        document.addEventListener("mousemove", (e) => {
            if (this.draggingNode) {
                const newX = e.clientX - this.startPos.x;
                const newY = e.clientY - this.startPos.y;
                this.draggingNode.style.left = newX + "px";
                this.draggingNode.style.top = newY + "px";

                // Update internal state
                const nodeId = this.draggingNode.id;
                if (this.nodes[nodeId]) {
                    this.nodes[nodeId].x = newX;
                    this.nodes[nodeId].y = newY;
                }

                this.updateLines();
            } else if (this.draggingPort) {
                this.lineTemp.x2 = e.clientX;
                this.lineTemp.y2 = e.clientY;
                this.updateLines();
            }
        });

        document.addEventListener("mouseup", (e) => {
            // Drop on 'in' port
            if (
                this.draggingPort &&
                e.target.classList.contains("port") &&
                e.target.dataset.type === "in"
            ) {
                const fromNode = this.draggingPort.dataset.node;
                const fromPortName = this.draggingPort.dataset.portName;
                const toNode = e.target.dataset.node;
                const toPortName = e.target.dataset.portName;
                this.addConnection(fromNode, fromPortName, toNode, toPortName);
            }
            this.draggingPort = null;
            this.lineTemp = null;
            this.draggingNode = null;
            this.updateLines();
        });

        // Connection deletion via double click on path
        this.svg.addEventListener('dblclick', (e) => {
            if (e.target.tagName === 'path') {
                const index = e.target.dataset.index;
                if (index !== undefined) {
                    this.removeConnection(parseInt(index, 10));
                }
            }
        });
    }

    addNodeFromSchema(type, x, y, id = null) {
        const nodeDef = this.nodeTypes[type];
        if (!nodeDef) {
            console.error(`Unknown node type: ${type}`);
            return null;
        }

        const nodeId = id || `node_${++this.nodeCounter}`;

        const nodeEl = document.createElement('div');
        nodeEl.className = 'node';
        nodeEl.id = nodeId;
        nodeEl.style.left = `${x}px`;
        nodeEl.style.top = `${y}px`;

        // Header
        const header = document.createElement('div');
        header.style.fontWeight = 'bold';
        header.style.marginBottom = '8px';
        header.innerText = nodeDef.name;
        nodeEl.appendChild(header);

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'node-delete-btn';
        delBtn.innerText = '×';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            this.removeNode(nodeId);
        };
        nodeEl.appendChild(delBtn);

        // Node state to save
        const nodeState = {
            element: nodeEl,
            type: type,
            inputs: nodeDef.inputs || [],
            outputs: nodeDef.outputs || [],
            parameters: {},
            x: x,
            y: y
        };

        // Inputs
        if (nodeDef.inputs && nodeDef.inputs.length > 0) {
            nodeDef.inputs.forEach((input, index) => {
                const portRow = document.createElement('div');
                portRow.style.position = 'relative';
                portRow.style.height = '16px';
                portRow.style.marginBottom = '4px';

                const label = document.createElement('span');
                label.innerText = `${input.name} (${input.type})`;
                label.style.fontSize = '10px';
                label.style.marginLeft = '8px';
                portRow.appendChild(label);

                const inPort = document.createElement('div');
                inPort.className = 'port in';
                inPort.dataset.node = nodeId;
                inPort.dataset.type = 'in';
                inPort.dataset.portName = input.name;
                portRow.appendChild(inPort);

                nodeEl.appendChild(portRow);
            });
        }

        // Outputs
        if (nodeDef.outputs && nodeDef.outputs.length > 0) {
            nodeDef.outputs.forEach((output, index) => {
                const portRow = document.createElement('div');
                portRow.style.position = 'relative';
                portRow.style.height = '16px';
                portRow.style.marginBottom = '4px';
                portRow.style.textAlign = 'right';

                const label = document.createElement('span');
                label.innerText = `${output.name} (${output.type})`;
                label.style.fontSize = '10px';
                label.style.marginRight = '8px';
                portRow.appendChild(label);

                const outPort = document.createElement('div');
                outPort.className = 'port out';
                outPort.dataset.node = nodeId;
                outPort.dataset.type = 'out';
                outPort.dataset.portName = output.name;
                portRow.appendChild(outPort);

                nodeEl.appendChild(portRow);
            });
        }

        // Parameters (Properties)
        if (nodeDef.parameters && nodeDef.parameters.length > 0) {
            const paramsDiv = document.createElement('div');
            paramsDiv.style.marginTop = '10px';
            paramsDiv.style.borderTop = '1px solid #555';
            paramsDiv.style.paddingTop = '5px';

            nodeDef.parameters.forEach(param => {
                nodeState.parameters[param.name] = param.default !== undefined ? param.default : null;

                const pRow = document.createElement('div');
                pRow.style.marginBottom = '4px';
                pRow.style.fontSize = '10px';

                const label = document.createElement('label');
                label.innerText = param.name + ": ";
                label.style.display = 'block';
                pRow.appendChild(label);

                let inputEl;
                if (param.uiType === 'number') {
                    inputEl = document.createElement('input');
                    inputEl.type = 'number';
                    inputEl.value = nodeState.parameters[param.name];
                    inputEl.style.width = '100%';
                    inputEl.style.boxSizing = 'border-box';
                    inputEl.onchange = (e) => { nodeState.parameters[param.name] = parseFloat(e.target.value); };
                    // Prevent dragging node when interacting with input
                    inputEl.onmousedown = (e) => e.stopPropagation();
                } else {
                    inputEl = document.createElement('input');
                    inputEl.type = 'text';
                    inputEl.value = nodeState.parameters[param.name] || "";
                    inputEl.style.width = '100%';
                    inputEl.style.boxSizing = 'border-box';
                    inputEl.onchange = (e) => { nodeState.parameters[param.name] = e.target.value; };
                    inputEl.onmousedown = (e) => e.stopPropagation();
                }
                pRow.appendChild(inputEl);
                paramsDiv.appendChild(pRow);
            });
            nodeEl.appendChild(paramsDiv);
        }

        this.container.appendChild(nodeEl);
        this.nodes[nodeId] = nodeState;
        return nodeId;
    }

    addNode(id, title, x, y, options = {}) {
        console.warn("addNode is deprecated. Use addNodeFromSchema instead.");
    }

    removeNode(nodeId) {
        if (!this.nodes[nodeId]) return;

        // Remove DOM element
        this.nodes[nodeId].element.remove();
        delete this.nodes[nodeId];

        // Remove connections related to this node
        this.connections = this.connections.filter(conn => conn.fromNode !== nodeId && conn.toNode !== nodeId);

        this.updateLines();
    }

    _generateAssetKey() {
        return `asset_${Math.random().toString(36).substr(2, 9)}`;
    }

    addConnection(fromNodeId, fromPortName, toNodeId, toPortName) {
        // Prevent self connections
        if (fromNodeId === toNodeId) return;

        // Ensure both nodes exist
        if (!this.nodes[fromNodeId] || !this.nodes[toNodeId]) return;

        // Check type compatibility
        const fromNode = this.nodes[fromNodeId];
        const toNode = this.nodes[toNodeId];

        let fromType = "Any", toType = "Any";

        if (fromNode.outputs) {
             const outDef = fromNode.outputs.find(o => o.name === fromPortName);
             if (outDef) fromType = outDef.type;
        }
        if (toNode.inputs) {
             const inDef = toNode.inputs.find(i => i.name === toPortName);
             if (inDef) toType = inDef.type;
        }

        if (fromType !== "Any" && toType !== "Any" && fromType !== toType) {
            console.warn(`Type mismatch: cannot connect ${fromType} to ${toType}`);
            return; // Reject connection if types don't match
        }

        // Check if connection already exists
        const exists = this.connections.some(conn =>
            conn.fromNode === fromNodeId && conn.fromPort === fromPortName &&
            conn.toNode === toNodeId && conn.toPort === toPortName);

        if (!exists) {
            // Check if there is an existing asset key for this output port to reuse
            let assetKey = null;
            const existingOutputConn = this.connections.find(conn => conn.fromNode === fromNodeId && conn.fromPort === fromPortName);
            if (existingOutputConn) {
                 assetKey = existingOutputConn.assetKey;
            } else {
                 assetKey = this._generateAssetKey();
            }

            // Remove any existing connection to this specific input port (1-to-1 input restriction)
            this.connections = this.connections.filter(conn => !(conn.toNode === toNodeId && conn.toPort === toPortName));

            this.connections.push({
                fromNode: fromNodeId,
                fromPort: fromPortName,
                toNode: toNodeId,
                toPort: toPortName,
                assetKey: assetKey
            });
            this.updateLines();
        }
    }

    exportIR() {
        const payload = {
            nodes: []
        };

        Object.keys(this.nodes).forEach(nodeId => {
            const n = this.nodes[nodeId];

            // Build input/output mappings based on connections
            const inputs = {};
            const outputs = {};

            this.connections.forEach(conn => {
                if (conn.toNode === nodeId) {
                    inputs[conn.toPort] = conn.assetKey;
                }
                if (conn.fromNode === nodeId) {
                    outputs[conn.fromPort] = conn.assetKey;
                }
            });

            payload.nodes.push({
                id: nodeId,
                type: n.type,
                inputs: inputs,
                outputs: outputs,
                parameters: { ...n.parameters },
                ui: {
                    x: n.x,
                    y: n.y
                }
            });
        });

        return JSON.stringify(payload, null, 2);
    }

    importIR(jsonString) {
        try {
            const payload = JSON.parse(jsonString);

            // Clear current state
            Object.keys(this.nodes).forEach(nodeId => this.removeNode(nodeId));
            this.connections = [];
            this.nodeCounter = 0;

            // Load nodes
            payload.nodes.forEach(n => {
                // Find highest id to prevent collisions later
                const idNum = parseInt(n.id.replace('node_', ''));
                if (!isNaN(idNum) && idNum > this.nodeCounter) {
                    this.nodeCounter = idNum;
                }

                this.addNodeFromSchema(n.type, n.ui.x, n.ui.y, n.id);

                // Restore parameters
                const nodeState = this.nodes[n.id];
                if (nodeState && n.parameters) {
                    for (const [key, value] of Object.entries(n.parameters)) {
                        nodeState.parameters[key] = value;
                        // update UI
                        const inputEl = nodeState.element.querySelector(`label:contains('${key}:') + input`);
                        // Basic fallback selection since CSS :contains is not standard
                        const labels = Array.from(nodeState.element.querySelectorAll('label'));
                        const targetLabel = labels.find(l => l.innerText.startsWith(key + ":"));
                        if (targetLabel && targetLabel.nextSibling) {
                            targetLabel.nextSibling.value = value;
                        }
                    }
                }
            });

            // Reconstruct connections based on shared Asset Keys
            const outputsMap = {}; // assetKey -> { nodeId, portName }

            payload.nodes.forEach(n => {
                if (n.outputs) {
                    for (const [portName, assetKey] of Object.entries(n.outputs)) {
                        outputsMap[assetKey] = { nodeId: n.id, portName: portName };
                    }
                }
            });

            payload.nodes.forEach(n => {
                if (n.inputs) {
                    for (const [portName, assetKey] of Object.entries(n.inputs)) {
                        const outSrc = outputsMap[assetKey];
                        if (outSrc) {
                            this.connections.push({
                                fromNode: outSrc.nodeId,
                                fromPort: outSrc.portName,
                                toNode: n.id,
                                toPort: portName,
                                assetKey: assetKey
                            });
                        }
                    }
                }
            });

            this.updateLines();

        } catch (e) {
            console.error("Failed to import IR:", e);
        }
    }

    removeConnection(index) {
        if (index >= 0 && index < this.connections.length) {
            this.connections.splice(index, 1);
            this.updateLines();
        }
    }

    updateLines() {
        this.svg.innerHTML = "";

        // Draw established connections
        this.connections.forEach((conn, index) => {
            const fromNodeEl = document.getElementById(conn.fromNode);
            const toNodeEl = document.getElementById(conn.toNode);

            if (fromNodeEl && toNodeEl) {
                const fromPort = fromNodeEl.querySelector(`.port.out[data-port-name="${conn.fromPort}"]`);
                const toPort = toNodeEl.querySelector(`.port.in[data-port-name="${conn.toPort}"]`);

                if (fromPort && toPort) {
                    const fromRect = fromPort.getBoundingClientRect();
                    const toRect = toPort.getBoundingClientRect();
                    this._drawLine(
                        fromRect.left + 6,
                        fromRect.top + 6,
                        toRect.left + 6,
                        toRect.top + 6,
                        index,
                        conn.assetKey
                    );
                }
            }
        });

        // Draw temporary line while dragging
        if (this.lineTemp) {
            this._drawLine(
                this.lineTemp.x1,
                this.lineTemp.y1,
                this.lineTemp.x2,
                this.lineTemp.y2
            );
        }
    }

    _drawLine(x1, y1, x2, y2, index = null, assetKey = null) {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const cp1x = x1 + Math.abs(x2 - x1) * 0.5,
              cp2x = x2 - Math.abs(x2 - x1) * 0.5;
        path.setAttribute(
            "d",
            `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`
        );

        // Add index data attribute so we can delete it later via double click
        if (index !== null) {
            path.dataset.index = index;
            path.title = "Double click to delete connection";
        }

        group.appendChild(path);

        if (assetKey) {
             const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
             text.setAttribute("x", x1 + (x2 - x1) / 2);
             text.setAttribute("y", y1 + (y2 - y1) / 2 - 5);
             text.setAttribute("text-anchor", "middle");
             text.setAttribute("fill", "#aaa");
             text.setAttribute("font-size", "10px");
             text.textContent = assetKey;
             text.style.pointerEvents = "none";
             group.appendChild(text);
        }

        this.svg.appendChild(group);
    }
}
