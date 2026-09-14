import { DataPipe } from "./dataPipe.js"

export type AsyncFunctionPipeProcessor<Input=unknown, Output=unknown> = (input: Input) => Promise<Output>;

export class AsyncFunctionPipe<Input=unknown, Output=unknown> extends DataPipe<Input, Output> {
	protected processor: AsyncFunctionPipeProcessor<Input, Output>;
	protected _input: Input | null = null;
	protected _oldInput: Input | null = null;
	protected _output: Output | null = null;
	protected _oldOutput: Output | null = null;
	public wipeInput: boolean = false;
	public wipeOutput: boolean = false;

	constructor (fn: AsyncFunctionPipeProcessor<Input, Output>) {
		super();

		this.processor = fn;
	}

	async run (input: Input) {
		this._oldInput = this._input;
		this._oldOutput = this._output;
		this._input = input;
		const output = await this.processor(input);

		this._output = output;

		this.trigger();

		return output;
	}

	trigger () {
		for (const l of this.listeners) {
			l(this._output as Output, this._oldOutput, this._input as Input, this._oldInput);
		}

		if (this.wipeInput) this._input = null;
		if (this.wipeOutput) this._output = null;
	}
}