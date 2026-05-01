// node-editor.js
class NodeEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);

        // Create SVG layer for lines
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.id = "svg-layer";
        this.container.appendChild(this.svg);

        this.nodes = {}; // Store node data: { id: { element, title, inputs, outputs, x, y } }
        this.connections = []; // Array of { from: nodeId, to: nodeId }

        // Drag state
        this.draggingNode = null;
        this.draggingPort = null;
        this.startPos = { x: 0, y: 0 };
        this.lineTemp = null;

        this.nodeCounter = 0;

        this._bindEvents();
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
                this.draggingNode.style.left = e.clientX - this.startPos.x + "px";
                this.draggingNode.style.top = e.clientY - this.startPos.y + "px";
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
                const toNode = e.target.dataset.node;
                this.addConnection(fromNode, toNode);
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

    addNode(id, title, x, y, options = {}) {
        const nodeId = id || `node_${++this.nodeCounter}`;
        const hasIn = options.in !== false;
        const hasOut = options.out !== false;

        const nodeEl = document.createElement('div');
        nodeEl.className = 'node';
        nodeEl.id = nodeId;
        nodeEl.style.left = `${x}px`;
        nodeEl.style.top = `${y}px`;
        nodeEl.innerText = title;

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'node-delete-btn';
        delBtn.innerText = '×';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            this.removeNode(nodeId);
        };
        nodeEl.appendChild(delBtn);

        // In Port
        if (hasIn) {
            const inPort = document.createElement('div');
            inPort.className = 'port in';
            inPort.dataset.node = nodeId;
            inPort.dataset.type = 'in';
            nodeEl.appendChild(inPort);
        }

        // Out Port
        if (hasOut) {
            const outPort = document.createElement('div');
            outPort.className = 'port out';
            outPort.dataset.node = nodeId;
            outPort.dataset.type = 'out';
            nodeEl.appendChild(outPort);
        }

        this.container.appendChild(nodeEl);

        this.nodes[nodeId] = { element: nodeEl, title, x, y };
        return nodeId;
    }

    removeNode(nodeId) {
        if (!this.nodes[nodeId]) return;

        // Remove DOM element
        this.nodes[nodeId].element.remove();
        delete this.nodes[nodeId];

        // Remove connections related to this node
        this.connections = this.connections.filter(conn => conn.from !== nodeId && conn.to !== nodeId);

        this.updateLines();
    }

    addConnection(fromNodeId, toNodeId) {
        // Prevent duplicate connections or self connections
        if (fromNodeId === toNodeId) return;

        // Ensure both nodes exist
        if (!this.nodes[fromNodeId] || !this.nodes[toNodeId]) return;

        // Check if connection already exists
        const exists = this.connections.some(conn => conn.from === fromNodeId && conn.to === toNodeId);
        if (!exists) {
            this.connections.push({ from: fromNodeId, to: toNodeId });
            this.updateLines();
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
            const fromNodeEl = document.getElementById(conn.from);
            const toNodeEl = document.getElementById(conn.to);

            if (fromNodeEl && toNodeEl) {
                const fromPort = fromNodeEl.querySelector('.port.out');
                const toPort = toNodeEl.querySelector('.port.in');

                if (fromPort && toPort) {
                    const fromRect = fromPort.getBoundingClientRect();
                    const toRect = toPort.getBoundingClientRect();
                    this._drawLine(
                        fromRect.left + 6,
                        fromRect.top + 6,
                        toRect.left + 6,
                        toRect.top + 6,
                        index
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

    _drawLine(x1, y1, x2, y2, index = null) {
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

        this.svg.appendChild(path);
    }
}
