
const $ = id => document.getElementById(id);

const initialRegisters = () => ({
  A: 0, B: 0, C: 0, D: 0,
  E: 0, H: 0, L: 0, PC: 0
});

let registers = initialRegisters();
let flags = { Z: 0, S: 0, CY: 0, P: 0 };
let memory = {};
let program = [];
let currentStep = 0;
let finalResult = null;

function hex(value, width = 2) {
  return (value >>> 0).toString(16)
    .toUpperCase().padStart(width, "0") + "H";
}

function renderRegisters() {
  $("registers").innerHTML = Object.entries(registers)
    .map(([name, value]) => `
      <div class="register">
        <strong>${name}</strong>${hex(value)}
      </div>
    `).join("");

  $("flags").textContent =
    `Z: ${flags.Z} | S: ${flags.S} | CY: ${flags.CY} | P: ${flags.P}`;
}

function renderMemory() {
  $("memory").textContent = Object.entries(memory)
    .map(([address, value]) => `${address}: ${hex(value)}`)
    .join("\n");
}

function setMemory(address, value) {
  memory[address] = value & 255;
}

function makeProgram(a, b, operation) {
  const common = [
    { text: "LDA 2050H", run: () => registers.A = a },
    { text: "MOV B,A", run: () => registers.B = registers.A },
    { text: "LDA 2051H", run: () => registers.A = b },
    { text: "MOV C,A", run: () => registers.C = registers.A }
  ];

  const ops = {
    ADD: [
      { text: "MOV A,B", run: () => registers.A = registers.B },
      { text: "ADD C", run: () => {
        const sum = registers.A + registers.C;
        flags.CY = sum > 255 ? 1 : 0;
        registers.A = sum & 255;
      }},
      { text: "STA 2053H", run: () => setMemory("2053H", registers.A) },
      { text: "HLT", run: () => finish(registers.A) }
    ],
    SUB: [
      { text: "MOV A,B", run: () => registers.A = registers.B },
      { text: "CMP C", run: () => flags.CY = registers.A < registers.C ? 1 : 0 },
      { text: "SUB C", run: () => {
        registers.A = Math.abs(registers.B - registers.C);
      }},
      { text: "STA 2053H", run: () => setMemory("2053H", registers.A) },
      { text: "HLT", run: () => finish(registers.A) }
    ],
    MUL: [
      { text: "MVI D,00H", run: () => registers.D = 0 },
      { text: "MVI A,00H", run: () => registers.A = 0 },
      { text: "MUL LOOP (repeated addition)", run: () => {
        registers.A = registers.B * registers.C & 255;
        registers.H = (registers.B * registers.C) >> 8;
      }},
      { text: "STA 2053H", run: () => setMemory("2053H", registers.A) },
      { text: "HLT", run: () => finish(registers.H * 256 + registers.A) }
    ],
    DIV: [
      { text: "CHECK DIVISOR", run: () => {
        if (registers.C === 0) {
          throw new Error("Division by zero");
        }
      }},
      { text: "DIV LOOP (repeated subtraction)", run: () => {
        registers.D = Math.floor(registers.B / registers.C);
        registers.A = registers.B % registers.C;
      }},
      { text: "STA 2054H (remainder)", run: () => setMemory("2054H", registers.A) },
      { text: "MOV A,D (quotient)", run: () => registers.A = registers.D },
      { text: "STA 2053H (quotient)", run: () => setMemory("2053H", registers.A) },
      { text: "HLT", run: () => finish(registers.A) }
    ]
  };

  return [...common, ...ops[operation]];
}

function prepare() {
  const a = Number($("num1").value);
  const b = Number($("num2").value);
  const operation = $("operation").value;

  if (!Number.isInteger(a) || !Number.isInteger(b) ||
      a < 0 || a > 255 || b < 0 || b > 255) {
    $("status").textContent = "Enter whole numbers from 0 to 255.";
    return false;
  }

  if (operation === "DIV" && b === 0) {
    $("status").textContent = "Error: division by zero.";
    $("result").textContent = "No result";
    return false;
  }

  registers = initialRegisters();
  flags = { Z: 0, S: 0, CY: 0, P: 0 };
  memory = {
    "2050H": a,
    "2051H": b,
    "2052H": { ADD: 0, SUB: 1, MUL: 2, DIV: 3 }[operation]
  };

  setMemory("2053H", 0);
  setMemory("2054H", 0);
  setMemory("2055H", 0);

  program = makeProgram(a, b, operation);
  currentStep = 0;
  finalResult = null;

  $("result").textContent = "Waiting for execution";
  $("details").textContent = "";
  $("status").textContent = "Program loaded";
  renderProgram();
  renderRegisters();
  renderMemory();
  return true;
}

function renderProgram() {
  $("assembly").innerHTML = program.map((instruction, index) =>
    `<div class="${index === currentStep ? "active-instruction" : ""}">` +
    `${String(index).padStart(2, "0")}: ${instruction.text}</div>`
  ).join("");
}

function executeStep() {
  if (currentStep >= program.length) {
    $("status").textContent = "Program finished. Reset to run again.";
    return;
  }

  try {
    program[currentStep].run();
    registers.PC = currentStep + 1;
    currentStep++;

    renderProgram();
    renderRegisters();
    renderMemory();

    if (currentStep >= program.length) {
      $("status").textContent = "Execution complete";
    } else {
      $("status").textContent = `Executed ${currentStep} instruction(s)`;
    }
  } catch (error) {
    $("status").textContent = error.message;
  }
}

function finish(value) {
  finalResult = value;
  setMemory("2055H", 0);

  $("result").textContent =
    `Decimal: ${value} | Hexadecimal: ${hex(value, value > 255 ? 4 : 2)}`;

  const op = $("operation").value;
  if (op === "DIV") {
    $("details").textContent =
      `Quotient: ${registers.D}, Remainder: ${memory["2054H"]}`;
  } else if (op === "MUL") {
    $("details").textContent = `16-bit product: ${value}`;
  } else if (op === "SUB") {
    $("details").textContent =
      registers.B < registers.C ? "Borrow: 1 (first number is smaller)" :
      "Borrow: 0";
    setMemory("2054H", registers.B < registers.C ? 1 : 0);
  }

  flags.Z = (value & 255) === 0 ? 1 : 0;
  flags.S = (value & 128) ? 1 : 0;
  flags.P = ((value & 255).toString(2).replace(/0/g, "").length % 2 === 0) ? 1 : 0;
}

$("runBtn").addEventListener("click", () => {
  if (currentStep === 0 || !program.length) {
    if (!prepare()) return;
  }

  while (currentStep < program.length) {
    executeStep();
    if ($("status").textContent.startsWith("Error:")) break;
  }
});

$("stepBtn").addEventListener("click", () => {
  if (!program.length || currentStep >= program.length) {
    if (!prepare()) return;
  }
  executeStep();
});

$("resetBtn").addEventListener("click", prepare);
$("operation").addEventListener("change", prepare);

prepare();
