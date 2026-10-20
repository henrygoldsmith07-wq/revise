import { type NewSubjectItem, buildNewSubjectQuestions } from "./aqa-new-subjects-shared";

// AQA A-level Computer Science (7517) starter bank: two original questions
// per topic. Unreviewed.

const items: NewSubjectItem[] = [
  {
    slug: "recursion-base-case",
    topic: "programming",
    stem: "A recursive function Factorial(n) returns n × Factorial(n − 1).",
    parts: [
      ["State what is missing from this definition and explain why it is needed.", 2, ["a base case such as Factorial(0) returns 1", "without it the recursion never stops and the stack overflows"], "It needs a base case such as Factorial(0) returns 1; without it the recursion never stops and the call stack overflows.", 4, "explain the need for a base case"],
      ["Explain why each recursive call uses memory.", 2, ["each call creates a stack frame", "holding parameters, local variables and the return address"], "Each call creates a stack frame on the call stack, holding parameters, local variables and the return address until that call finishes.", 4, "explain stack frames in recursion"],
    ],
  },
  {
    slug: "oop-inheritance",
    topic: "programming",
    stem: "A program has a class Vehicle with a method Describe(). Classes Car and Bike are subclasses of Vehicle, and each redefines Describe().",
    parts: [
      ["Name the OOP feature that lets Car reuse the attributes of Vehicle.", 1, ["inheritance"], "Inheritance lets Car reuse the attributes and methods of Vehicle.", 5, "identify inheritance"],
      ["Explain what is meant by overriding and how it gives polymorphism here.", 2, ["each subclass redefines the inherited method", "the same call Describe() behaves differently for Car and Bike objects"], "Overriding means each subclass redefines the inherited method, so the same call Describe() behaves differently for Car and Bike objects, which is polymorphism.", 5, "explain overriding and polymorphism"],
    ],
  },
  {
    slug: "stack-trace",
    topic: "data-structures",
    stem: "An empty stack has these operations applied in order: Push(4), Push(7), Pop(), Push(2), Push(9), Pop().",
    parts: [
      ["State the contents of the stack from bottom to top after these operations.", 2, ["4 at the bottom", "2 on top"], "The stack holds 4 at the bottom and 2 on top: 7 and 9 were each popped as the most recent item.", 3, "trace stack operations"],
      ["State one use of a stack in a computer system.", 1, ["storing return addresses for subroutine calls"], "A stack is used for storing return addresses for subroutine calls, so the program can resume in the right place.", 3, "recall a use of stacks"],
    ],
  },
  {
    slug: "adjacency-representation",
    topic: "data-structures",
    stem: "A social network has 10 000 users, and each user is connected to about 50 others.",
    parts: [
      ["Recommend an adjacency list or an adjacency matrix for storing this graph and justify your choice.", 2, ["adjacency list", "the graph is sparse so a matrix would waste memory on empty entries"], "An adjacency list, because the graph is sparse: each user has far fewer connections than users, so a 10 000 by 10 000 matrix would waste memory on empty entries.", 4, "choose a graph representation"],
    ],
  },
  {
    slug: "binary-search-steps",
    topic: "algorithms",
    stem: "A sorted list holds 1 023 items.",
    calculator: false,
    parts: [
      ["State the maximum number of comparisons a binary search needs to find an item, and explain why.", 2, ["10 comparisons", "each comparison halves the remaining list"], "At most 10 comparisons are needed in the worst case, because each comparison halves the remaining list and 2 to the power 10, minus 1, is 1 023.", 4, "apply binary search complexity"],
      ["State the time complexity of linear search.", 1, ["O(n)"], "Linear search has time complexity O(n), as it may check every item once.", 4, "recall linear search complexity"],
    ],
  },
  {
    slug: "rpn-evaluate",
    topic: "algorithms",
    kind: "calculation",
    calculator: false,
    stem: "Evaluate the Reverse Polish expression 3 4 + 2 ×.",
    parts: [
      ["Give the result and the infix form of the expression.", 2, ["14", "(3 + 4) × 2"], "The result is 14: 3 and 4 are added to give 7, which is multiplied by 2. The infix form is (3 + 4) × 2.", 3, "evaluate Reverse Polish notation"],
    ],
  },
  {
    slug: "fsm-even-ones",
    topic: "theory-of-computation",
    stem: "A finite state machine accepts binary strings that contain an even number of 1s.",
    parts: [
      ["State the minimum number of states needed and what each state represents.", 2, ["two states", "one for an even count of 1s so far and one for an odd count"], "Two states are needed: one for an even count of 1s read so far, which is the accepting state, and one for an odd count.", 2, "design a finite state machine"],
      ["Explain the effect of reading a 0 in either state.", 1, ["reading 0 stays in the same state"], "Reading 0 stays in the same state, because it does not change how many 1s have been seen.", 2, "trace FSM transitions"],
    ],
  },
  {
    slug: "big-o-tractable",
    topic: "theory-of-computation",
    kind: "mcq",
    stem: "Which time complexity makes a problem intractable?",
    options: ["O(log n)", "O(n²)", "O(2ⁿ)", "O(n log n)"],
    correctIndex: 2,
    parts: [["Select the correct option.", 1, ["O(2ⁿ) exponential"], "O(2ⁿ) is exponential time, so no polynomial-time solution exists for large inputs and the problem is intractable.", 5, "classify tractable and intractable problems"]],
  },
  {
    slug: "twos-complement",
    topic: "data-representation",
    kind: "calculation",
    calculator: false,
    stem: "Represent −20 as an 8-bit two's complement binary number.",
    parts: [
      ["Give the 8-bit two's complement representation of −20 and show your method.", 2, ["20 is 00010100", "−20 is 11101100"], "In binary 20 is 00010100. Flipping every bit gives 11101011, and adding one gives −20 = 11101100.", 3, "convert to two's complement"],
    ],
  },
  {
    slug: "bitmap-size",
    topic: "data-representation",
    kind: "calculation",
    stem: "An image is 800 pixels wide and 600 pixels high, with a colour depth of 24 bits.",
    parts: [
      ["Calculate the file size in bytes, ignoring metadata.", 2, ["800 × 600 × 24 = 11 520 000 bits", "1 440 000 bytes"], "800 × 600 × 24 = 11 520 000 bits; dividing by 8 gives 1 440 000 bytes.", 5, "calculate bitmap file size"],
      ["State what happens to the file size if the colour depth is reduced to 8 bits.", 1, ["it falls to a third"], "The file size falls to a third, 480 000 bytes, because each pixel uses a third as many bits.", 5, "relate colour depth to file size"],
    ],
  },
  {
    slug: "translators",
    topic: "computer-systems",
    stem: "A developer is choosing between a compiler and an interpreter for a new program.",
    parts: [
      ["Explain one advantage of a compiler.", 2, ["produces object code that runs without the translator", "the compiled program runs faster"], "A compiler produces object code that runs without the translator present, and the compiled program runs faster because translation is done once.", 4, "evaluate compilers"],
      ["Explain one advantage of an interpreter during development.", 2, ["executes line by line", "stops at the first error making debugging easier"], "An interpreter executes line by line, so it stops at the first error, making debugging easier while the program is written.", 4, "evaluate interpreters"],
    ],
  },
  {
    slug: "de-morgan",
    topic: "computer-systems",
    kind: "mcq",
    stem: "Which expression is equivalent to NOT (A AND B)?",
    options: ["NOT A AND NOT B", "NOT A OR NOT B", "A OR B", "NOT A OR B"],
    correctIndex: 1,
    parts: [["Select the correct option.", 1, ["NOT A OR NOT B"], "By De Morgan's law, NOT (A AND B) equals NOT A OR NOT B.", 5, "apply De Morgan's laws"]],
  },
  {
    slug: "fetch-stage",
    topic: "architecture",
    stem: "The fetch–execute cycle starts with the fetch stage.",
    parts: [
      ["Describe the fetch stage using register transfer.", 3, ["the PC is copied to the MAR", "the instruction is copied from memory into the MBR and then the CIR", "the PC is incremented"], "The PC is copied to the MAR; the instruction at that address is copied from memory into the MBR and then the CIR; and the PC is incremented to point at the next instruction.", 3, "describe the fetch stage"],
    ],
  },
  {
    slug: "addressing-modes",
    topic: "architecture",
    stem: "An assembly language instruction is LDR R1, #25.",
    parts: [
      ["Identify the addressing mode used and state what value is loaded into R1.", 2, ["immediate addressing", "the value 25 itself is loaded"], "This is immediate addressing, shown by the # symbol, so the value 25 itself is loaded into R1 rather than the contents of address 25.", 4, "distinguish immediate and direct addressing"],
    ],
  },
  {
    slug: "developer-power",
    topic: "consequences",
    stem: "A company uses an algorithm to shortlist job applicants automatically.",
    parts: [
      ["Explain one ethical issue this raises and one way the company could reduce it.", 3, ["the algorithm may be biased by its training data", "against some groups of applicants", "audit the results or keep a human reviewer"], "The algorithm may be biased by its training data, for example past hiring decisions, so it could discriminate against some groups of applicants; the company could audit the results regularly or keep a human reviewer in the loop.", 1, "discuss algorithmic bias"],
    ],
  },
  {
    slug: "legislation-jurisdiction",
    topic: "consequences",
    stem: "Personal data about UK users is stored by a company on servers in another country.",
    parts: [
      ["Explain why legislation can struggle to protect these users.", 2, ["data crosses national jurisdictions", "laws in one country may not apply where the data is stored"], "The data crosses national jurisdictions, so laws in one country may not apply where the data is stored or be enforceable against the company.", 3, "explain challenges for legislators"],
    ],
  },
  {
    slug: "serial-parallel",
    topic: "networking",
    stem: "Most modern connections, such as USB, use serial rather than parallel transmission.",
    parts: [
      ["Explain why serial transmission is preferred over long distances.", 2, ["no data skew because bits travel one after another", "less crosstalk and cheaper cabling"], "Serial transmission sends bits one after another on one wire, so there is no data skew, and there is less crosstalk and cheaper cabling than with parallel wires.", 1, "compare serial and parallel transmission"],
    ],
  },
  {
    slug: "symmetric-asymmetric",
    topic: "networking",
    stem: "Alice wants to send Bob a message that only Bob can read, using asymmetric encryption.",
    parts: [
      ["State which key Alice uses to encrypt the message and which key Bob uses to decrypt it.", 2, ["Alice encrypts with Bob's public key", "Bob decrypts with his own private key"], "Alice encrypts with Bob's public key, which anyone may know, and Bob decrypts with his own private key, which only he holds.", 4, "apply asymmetric encryption"],
    ],
  },
  {
    slug: "normalisation",
    topic: "databases",
    stem: "A table Order(OrderID, CustomerID, CustomerName, ProductID, Quantity) stores CustomerName in every order row.",
    parts: [
      ["Explain why this table is not in third normal form.", 2, ["CustomerName depends on CustomerID", "not on the primary key, a transitive dependency"], "CustomerName depends on CustomerID rather than directly on the primary key, which is a transitive dependency, so the table is not in third normal form.", 3, "identify a transitive dependency"],
      ["Describe how the table should be split.", 2, ["create a Customer table with CustomerID and CustomerName", "keep CustomerID in Order as a foreign key"], "Create a Customer table with CustomerID as its key and CustomerName, and keep CustomerID in the Order table as a foreign key, so each name is stored once and update anomalies disappear.", 3, "normalise to third normal form"],
    ],
  },
  {
    slug: "sql-select",
    topic: "databases",
    stem: "A table Student has fields StudentID, Surname, Year and Score.",
    parts: [
      ["Write an SQL query to list the surnames of Year 13 students with a score above 70, highest score first.", 3, ["SELECT Surname FROM Student", "WHERE Year = 13 AND Score > 70", "ORDER BY Score DESC"], "SELECT Surname FROM Student WHERE Year = 13 AND Score > 70 ORDER BY Score DESC; this returns only matching rows, sorted from the best result down.", 4, "write an SQL SELECT query"],
    ],
  },
  {
    slug: "map-filter-fold",
    topic: "functional-programming",
    stem: "In a functional language, xs = [1, 2, 3, 4].",
    calculator: false,
    parts: [
      ["State the result of map (× 2) xs.", 1, ["[2, 4, 6, 8]"], "map applies the function to every element, giving [2, 4, 6, 8].", 3, "apply map"],
      ["State the result of fold (+) 0 xs and explain what fold does.", 2, ["10", "it combines the elements into a single value"], "The result is 10: fold combines the elements into a single value by repeatedly adding, starting from 0.", 3, "apply fold"],
    ],
  },
  {
    slug: "head-tail",
    topic: "functional-programming",
    stem: "A list is defined as [5, 8, 1].",
    parts: [
      ["State the head and the tail of the list.", 2, ["the head is 5", "the tail is [8, 1]"], "The head is 5, the first element, and the tail is [8, 1], the list without its first element.", 4, "identify head and tail"],
    ],
  },
];

export const aqaComputerScienceQuestions = buildNewSubjectQuestions("aqa-alevel-computer-science", items);
