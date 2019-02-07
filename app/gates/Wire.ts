import { WireProps } from "../interfaces/canvas";
import { Wiring } from "../actions/canvas";

export default class Wire {
    public state: WireProps
    constructor(props: WireProps) {
        this.state = props;
    }
    public render = (ctx: CanvasRenderingContext2D): void => {
        Wiring.drawWire(ctx, this.state.start, this.state.end);
    }
}