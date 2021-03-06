import { get } from 'electron-settings';
import Workspace from '../components/Workspace';
import { GateNode, Gates, Wire, AndGate, LED, NotGate, Switch, OrGate, XOrGate } from '../gates';
import { AnyGate } from '../interfaces/canvas';
import * as IComponent from '../interfaces/components';
import { ipcRenderer } from "electron";
export namespace Saving {
    function addWires(output: AnyGate[], wires: Wire[], gates: IComponent.GateStatePlecibo[]): void {
        // Connect gates
        for (let plecibo of gates) {
            plecibo.inputs.forEach(val => {
                for (let checks of output) {
                    if(plecibo.id !== checks.state.id && val === checks.state.id) {
                        let out = output.find(valOut => { return valOut.state.id === plecibo.id });
                        if (!!out) out.connect("in", checks);
                    }
                }
            });
            plecibo.outputs.forEach(val => {
                for (let checks of output) {
                    if(plecibo.id !== checks.state.id && val === checks.state.id) {
                        let out = output.find(valOut => { return valOut.state.id === plecibo.id });
                        if (!!out) out.connect("out", checks);
                    }
                }
            });
        }

        // Create wire objects
        for (let gate of output) {
            gate.state.gateIn.forEach((g, i) => {
                // TODO: fix for multi out
                let n = g.state.nodes.start[0];
                let endNode = gate.state.nodes.end[i];
                let wire = new Wire({startNode: n, endNode});
                endNode.state.wire.push(wire);
                n.state.wire.push(wire);
                wires.push(wire);
            });
        }
    }
    export function deserialize<T extends Gates<T>>(gates: IComponent.GateStatePlecibo[], 
        endNodes: GateNode<any>[], startNodes: GateNode<any>[], ctx: CanvasRenderingContext2D, type: string): T[] {
            const construct = (): AnyGate => {
                switch (type) {
                    case "and":
                        return new AndGate(ctx);
                    case "or":
                        return new OrGate(ctx);
                    case "xor":
                        return new XOrGate(ctx);
                    case "not":
                        return new NotGate(ctx);
                    case "switch":
                        return new Switch(ctx);
                    case "led":
                        return new LED(ctx);
                    default:
                        return new AndGate(ctx);
                }
            } 
            let output: T[] = [];
            // Get gates and nodes
            for (let gate of gates) {
                let constructed: T = {} as T;
                constructed = construct() as T;
                constructed.ctx = ctx;
                let nodes = typeof gate.invert !== "undefined" ? constructed.add(gate.coords, gate.size, gate.id, gate.invert) : constructed.add(gate.coords, gate.size, gate.id);
                output.push(constructed);
                endNodes.push(...nodes.end);
                startNodes.push(...nodes.start);
            }
            return output;
    }
    function genGates<T extends Gates<T>>(gates: T[]): IComponent.GateStatePlecibo[] {
        let ret: IComponent.GateStatePlecibo[] = [];
        for (let g of gates) {
            if (!!g.state) {
                ret.push({
                    coords: g.state.coords, 
                    size: g.state.size, 
                    id: g.state.id,
                    inputs: ((): number[] => {
                        let retg = [];
                        for (let gg of g.state.gateIn) retg.push(gg.state.id)
                        return retg;
                    })(),
                    outputs: ((): number[] => {
                        let retg = [];
                        for (let gg of g.state.gateOut) retg.push(gg.state.id)
                        return retg;
                    })(),
                    type: (typeof g).toString(),
                    invert: g.state.invert
                });
            }
        }
        return ret;
    }
    export function saveState(workspace: Workspace, addStatus: (message: string, reload: boolean) => void, savePath?: string, callback = () => {}): void {
        const sendSave = (path: string): void => {
            console.log(path);
            workspace.setState({path});
            const save: IComponent.WorkspaceSaveState = {
                gates: {
                    and: genGates(workspace.gates.and),
                    or: genGates(workspace.gates.or),
                    not: genGates(workspace.gates.not),
                    led: genGates(workspace.gates.led),
                    switch: genGates(workspace.gates.switch),
                    xor: genGates(workspace.gates.xor)
                },
                gridFactor: workspace.state.gridFactor,
                snapFactor: workspace.state.snapFactor,
            }
            ipcRenderer.send("save", {"path": path, "data": save});
            addStatus(`Saved to: ${path}`, false);
        }

        ipcRenderer.on("saved", callback)
        
        if (!!!savePath) {
            ipcRenderer.send("savePath");
        }
        else {
            sendSave(savePath);
        }
        
        ipcRenderer.on("gotSave", (_: any, path: string) => sendSave(path));

    }
    function loader(workspace: Workspace, save: IComponent.WorkspaceSaveState): void {
        let wires: Wire[] = [];
        let startNodes: GateNode<any>[] = [];
        let endNodes: GateNode<any>[] = [];

        workspace.gates.and = deserialize(save.gates.and, endNodes, startNodes, workspace.ctx, "and");
        workspace.gates.or = deserialize(save.gates.or, endNodes, startNodes, workspace.ctx, "or");
        workspace.gates.not = deserialize(save.gates.not, endNodes, startNodes, workspace.ctx, "not");
        workspace.gates.switch = deserialize(save.gates.switch, endNodes, startNodes, workspace.ctx, "switch");
        workspace.gates.led = deserialize(save.gates.led, endNodes, startNodes, workspace.ctx, "led");
        workspace.gates.xor = deserialize(save.gates.xor, endNodes, startNodes, workspace.ctx, "xor");
        console.log(workspace.gates.and);
        let all: AnyGate[] = [
            ...workspace.gates.and,
            ...workspace.gates.or,
            ...workspace.gates.not,
            ...workspace.gates.switch,
            ...workspace.gates.led,
            ...workspace.gates.xor
        ];
        // Push all gate ids
        Gates.IDS = [];
        for (let gate of all) {
            Gates.IDS.push(gate.state.id);
        }
        let allPlecibo: IComponent.GateStatePlecibo[] = [
            ...save.gates.and,
            ...save.gates.or,
            ...save.gates.not,
            ...save.gates.switch,
            ...save.gates.led,
            ...save.gates.xor
        ]
        addWires(all, wires, allPlecibo);
        workspace.gates.wire = wires;
        
        workspace.startNodes = startNodes;
        workspace.endNodes = endNodes;

        workspace.setState({
            gridFactor: save.gridFactor,
            snapFactor: save.snapFactor,
        });
    }
    export function loadState(workspace: Workspace): void {
        let save = get(`saves.default`) as any as IComponent.WorkspaceSaveState;

        ipcRenderer.send("findFile");
        ipcRenderer.on("foundFile", (_: any, path: string) => {
            workspace.setState({path});
            ipcRenderer.send("readFile", path);
        });

        ipcRenderer.on("read", (_: any, data: any) => {
            console.log(data);
            save = data as IComponent.WorkspaceSaveState;
            loader(workspace, save);
        });

        ipcRenderer.on("readError", (_: any, error: string) => {
            console.error(error);
            loader(workspace, save);
        });
    }
}