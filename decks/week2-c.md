layout: title-slide
background: linear-gradient(135deg, #eae4f0 0%, #f9fcfe 100%)
align: center

@title

# Loops & Arrays in C
## COMP 2510 – Week 2
### Hesam Alizadeh

---

layout: header-two-column

@header
## Where we are in the Course

@main
### Last Week (Week 1)
- C toolchain: **edit → compile → link → run**
- Basic syntax, types, `printf`/`scanf`
- **Decision making:** `if`, `else`, `switch`
- Debugging fundamentals

### Today (Week 2)
- **Control Flow:** Loops (`while`, `for`, `do-while`)
- **Arrays:** Memory layout, initialization, iteration
- **Critical Differences** from Java
- Common pitfalls & debugging

@media
### Coming Up
- **Week 3:** Functions & Call Stack
- **Week 4:** Pointers

---

layout: header-content

@header
## By the end of today you can...

@main
- Use **`switch`** statements effectively and avoid fall-through bugs
- Safely write **`while`**, **`for`**, and **`do-while`** loops in C
- Declare, initialize, and iterate over **arrays**
- Explain **3 key differences** between C & Java arrays
- Manipulate Strings as character arrays
- Debug loop/array bugs using tracing & compiler warnings

---

layout: header-two-column

@header
## Recap: `switch` Statements
### Cleaner than many `else-if`s

@main
Great for checking a single variable against specific **integer** or **char** constants.

```c
char grade;
printf("Enter grade (A/B/C): ");
scanf(" %c", &grade);

switch (grade) {
    case 'A':
        printf("Excellent!\n");
        break;
    case 'B':
        printf("Good job.\n");
        break;
    case 'C':
        printf("You passed.\n");
        break;
    default:
        printf("Invalid grade.\n");
}
```

@media
### ⚠️ Key Restrictions
1. **Expression must be integer-compatible:**
   - `int`, `char`, `long` ✅
   - `float`, `double`, Strings ❌

2. **Cases must be Constants:**
   - `case 1:` ✅
   - `case x:` ❌ (variable)
   - `case x > 5:` ❌ (condition)

**Note:** Just like Java, `break` is crucial!

---


layout: "header" "main" / 1fr

@header
## ⚠️ The `switch` Fall-Through

@main
If you omit `break`, execution **falls through** to the next case.

```c
int num = 1;
switch (num) {
    case 1: 
        printf("One ");
        // No break here!
    case 2:
        printf("Two ");
        break;
    default:
        printf("Other");
}
```

**Is this a bug or a feature?**
Sometimes useful! stacking cases:
```c
case 'a':
case 'e':
case 'i':
    printf("It is a vowel");
    break;
```

---

layout: header-two-column

@header
## Loop Syntax: Java → C

@main
### Familiar Syntax
```c
// Same structure as Java!
while (condition) { /* body */ }

for (init; condition; update) { /* body */ }

do { /* body */ } while (condition);
```

**Good news:** The syntax you know works here.

**Bad news:** C won't save you from your mistakes.

@media
### C-Specific Gotchas
- Braces `{}` optional for single statements
- No `for-each` loop like Java's `for (int x : arr)`
- Must manually track loop termination

---

layout: header-two-column

@header
## `while` Loop

@main
Checks condition **BEFORE** each iteration. Runs **0+ times**.

```c
int i = 0;
while (i < 3) {
    printf("%d ", i);
    i++;   // ⚠️ MUST update!
}
// Output: ?
```

**Pitfall:** Forgetting to update `i` → **infinite loop**!

**Unlike Java:** No IDE warning, no runtime exception. Your program just hangs.

@media
### Sentinel Value Pattern
```c
int num;
printf("Enter numbers (-1 to stop):\n");
scanf("%d", &num);

while (num != -1) {
    printf("Got: %d\n", num);
    scanf("%d", &num);
}
```

**Note:** Must read BEFORE the loop AND inside it. Common pattern in C for input processing.

---

layout: header-two-column
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

@header
## 💻 Activity: `while` Loop Prediction
**Predict the output for each. Then trace through to verify.**

@main
**Example 1:**
```c
int x = 5;
while (x > 0) {
    printf("%d ", x);
    x -= 2;
}
// Output: ?
```

**Example 2:**
```c
int n = 1;
while (n < 50) {
    n = n * 2;
}
printf("%d", n);
// Output: ?
```

@media
**Example 3:**
```c
int count = 0;
int val = 100;
while (val > 1) {
    val = val / 2;
    count++;
}
printf("count = %d", count);
// Output: ?
```

**Challenge:** What's the relationship between the initial value and the count?

---

layout: header-two-column

@header
## `do‑while` Loop

@main
Body runs **AT LEAST ONCE** before condition check.

```c
int num;
do {
    printf("Enter 1-10: ");
    scanf("%d", &num);
} while (num < 1 || num > 10);
printf("You entered: %d\n", num);
```

Ideal for:
- Input validation
- Menu systems
- Games (play at least once)

@media
### Why not `while`?
```c
int num; // UNINITIALIZED - garbage value!
while (num < 1 || num > 10) {
    printf("Enter 1-10: ");
    scanf("%d", &num);
}
```

**In Java:** Compiler error for uninitialized variable.
**In C:** Compiles fine. `num` contains garbage. Loop behavior is unpredictable!

---

layout: "header" "main" / 1fr
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

@header
## 💻 Activity: Menu with `do-while`
**Trace through this code. What happens if user enters: 2, 5, 3?**

@main

```c
int choice;
do {
    printf("\n=== MENU ===\n");
    printf("1. Say Hello\n");
    printf("2. Say Goodbye\n");
    printf("3. Exit\n");
    printf("Choice: ");
    scanf("%d", &choice);
    
    if (choice == 1) {
        printf("Hello!\n");
    } else if (choice == 2) {
        printf("Goodbye!\n");
    } else if (choice != 3) {
        printf("Invalid choice!\n");
    }
} while (choice != 3);

printf("Program ended.\n");
```

What gets printed for inputs 2, 5, 3?

---

layout: header-two-column

@header
## `for` Loop

@main
```c
for (int i = 0; i < 5; i++) {
    printf("%d ", i);
}
// Output: 0 1 2 3 4
```

**Structure:**
- `init` → runs **once** at the start
- `condition` → checked **before** each iteration
- `update` → runs **after** each body execution

**Scope (C99+):** `i` only exists inside the loop.

@media
### Variations
```c
// Count down
for (int i = 10; i >= 1; i--) {
    printf("%d ", i);
}

// Step by 2
for (int i = 0; i < 10; i += 2) {
    printf("%d ", i);
}

// Multiple variables
for (int i = 0, j = 10; i < j; i++, j--) {
    printf("(%d,%d) ", i, j);
}
```

---

layout: "header" "main" / 1fr
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

@header
## 💻 Activity: `for` Loop Patterns

@main
**Write `for` loops to produce each output:**

**1. Print:** `10 8 6 4 2 0`
```c
for (int i = ?; ?; ?) {
    printf("%d ", i);
}
```

**2. Print:** `1 2 4 8 16 32 64`
```c
for (int i = ?; ?; ?) {
    printf("%d ", i);
}
```

**3. Print:** `(0,5) (1,4) (2,3) (3,2) (4,1) (5,0)`
```c
for (int i = ?, j = ?; ?; ?, ?) {
    printf("(%d,%d) ", i, j);
}
```

---

layout: header-two-column

@header
## ⚠️ The Semicolon of Death
### This doesn't exist in Java!

@main
```c
for (int i = 0; i < 3; i++);  // STRAY SEMICOLON!
{
    printf("Hello\n");
}
```

**What actually happens:**
1. Loop runs 3 times with **empty body** (the `;` IS the body)
2. Block `{}` runs **once** after loop ends

**In Java:** IDE would likely warn you.
**In C:** Compiles silently. Your bug.

@media
**Same danger with `while`:**
```c
int x = 5;
while (x > 0);  
{
    x--; 
}
```
**Result:** Infinite loop!

### Compiler Can Help
```bash
gcc -Wall -Wextra program.c
# warning: for loop has empty body
```
🔑 **Always compile with `-Wall -Wextra`!**

---

layout: "header" "main" / 1fr
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

@header
## 💻 Activity: Find the Bugs
### Each snippet has a C-specific bug. Find and fix them.

@main
**Bug 1:**
```c
int sum = 0;
for (int i = 1; i <= 10; i++);
{
    sum += i;
}
printf("Sum: %d\n", sum);
```

**Bug 2:**
```c
int x = 10;
while (x > 0)
    printf("%d ", x);
    x--;
```

**Bug 3:**
```c
for (int i = 0; i < 5; i++)
    printf("i = %d\n", i)
    printf("i squared = %d\n", i * i);
```

---

layout: header-two-column

@header
## `break` and `continue`

@main
**`break`** — Exit the loop immediately
```c
for (int i = 0; i < 100; i++) {
    if (i == 5) break;
    printf("%d ", i);
}
// Output: 0 1 2 3 4
```

**`continue`** — Skip to next iteration
```c
for (int i = 0; i < 5; i++) {
    if (i % 2 == 0) continue;
    
    printf("%d ", i);
}
// Output: 0 1 3 4
```

@media
### Nested Loops
`break` and `continue` only affect the **innermost** loop:

```c
for (int i = 0; i < 3; i++) {
    for (int j = 0; j < 3; j++) {
        if (j == 1) break;  // Only exits inner loop
        printf("(%d,%d) ", i, j);
    }
    printf("\n");
}
// Output: ?
```

---

layout: "header" "main" / 1fr
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

@header
## 💻 Activity: Trace `break` and `continue`

@main
**Trace through each. What is the final output?**

**Example 1:**
```c
int sum = 0;
for (int i = 1; i <= 10; i++) {
    if (i % 3 == 0) continue;
    sum += i;
}
printf("Sum: %d\n", sum);
// Which values are added? Final sum = ?
```

**Example 2:**
```c
int product = 1;
for (int i = 1; i <= 10; i++) {
    product *= i;
    if (product > 100) break;
}
printf("i = ?, product = ?\n");
// What are final values of i and product?
```

---

layout: header-two-column

@header
## Declaring & Initializing Arrays

@main
```c
// Uninitialized
int scores[5];

// Full initialization
int scores[5] = {90, 80, 70, 60, 50};

// Partial → rest become 0
int scores[5] = {90, 80};
// Result: {90, 80, 0, 0, 0}

// Let compiler count
int scores[] = {90, 80, 70}; // size = 3
```

@media
### ⚠️ Uninitialized = ?
```c
int mystery[3];
printf("%d\n", mystery[0]); 
// Could print ANYTHING!
```

**In Java:** `new int[3]` gives you zeros.
**In C:** Local arrays contain "random" data unless you initialize them.

### Best Practice
```c
int data[10] = {0};  // All zeros
```

---

layout: "header" "main" / 1fr
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

@header
## 💻 Activity: Array Initialization

@main
**What values are in each array after initialization?**

```c
int b[] = {2, 4, 6, 8, 10};
// Size of b = ?

int c[3] = {0};
// c[0] = ?  c[1] = ?  c[2] = ?

int d[4] = {7};
// d[0] = ?  d[1] = ?  d[2] = ?  d[3] = ?
```

---

layout: header-two-column

@header
## Generating Random Numbers
### Need test data for your arrays?

@main
### The `stdlib.h` & `time.h` way

1. **Seed the generator** (Do this ONCE at start of main)
2. **Call `rand()`** to get a number

```c
#include <stdlib.h>
#include <time.h>

int main() {
    // 1. Seed using current time
    srand(time(NULL)); 

    // 2. Generate numbers
    int r = rand(); // 0 to RAND_MAX
    
    // 3. Limit range (e.g., 0 to 9)
    int small = rand() % 10;
}
```

@media
### Common **Mistake**: Re-seeding
```c
for (int i=0; i<5; i++) {
    srand(time(NULL)); // WRONG!
    printf("%d", rand());
}
```
**Why?** The loop runs so fast the time hasn't changed. You will get the **same number** 5 times!

💡 **Rule:** Call `srand` exactly once at the beginning.

💡 `rand()` is actually a pre-set list of numbers. srand() tells the computer where to start reading that list. If you don't seed, you start at the same spot every time!


---

layout: "header header" "main media" / 1fr 1fr

@header
## Array = Contiguous Memory

@main
`int arr[5] = {10, 20, 30, 40, 50};`

In memory (assuming `int` = 4 bytes):

| Index | Value | Address | Calculation |
|:---:|:---:|:---:|:---|
| 0 | 10 | 1000 | `1000 + (0 * 4)` |
| 1 | 20 | 1004 | `1000 + (1 * 4)` |
| 2 | 30 | 1008 | `1000 + (2 * 4)` |

Elements stored **consecutively** in memory. This is why C can calculate element positions quickly.

@media
```d2
classes: {
  mem_cell: {
    width: 400
    height: 80
    style: {
      font-size: 28
      stroke-width: 4
      border-radius: 0
    }
  }
}

Stack Memory: {
  grid-columns: 1
  style: {
    stroke-width: 0
    fill: transparent
  }

  mem0: "10 (arr[0])" {
    class: mem_cell
  }
  mem1: "20 (arr[1])" {
    class: mem_cell
  }
  mem2: "30 (arr[2])" {
    class: mem_cell
  }
  mem3: "40 (arr[3])" {
    class: mem_cell
  }
  mem4: "50 (arr[4])" {
    class: mem_cell
  }
}
```

---

layout: header-content

@header
## Iterating Over Arrays

@main
**ALWAYS use a named constant for size!**

```c
#define SIZE 5
int data[SIZE] = {10, 20, 30, 40, 50};

// Print all elements
for (int i = 0; i < SIZE; i++) {
    printf("data[%d] = %d\n", i, data[i]);
}
```

- Use `i < SIZE` (not `i <= SIZE`)
- Use `SIZE` constant everywhere
- Change once, works everywhere

---

layout: "header" "main" / 1fr
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

@header
## 💻 Activity: Array Processing

@main
**Complete each task using the array below:**
```c
#define SIZE 6
int values[SIZE] = {4, 8, 2, 9, 1, 7};
```

1. Calculate the sum of all elements
```c
int sum = 0;
// Your loop here
printf("Sum = %d\n", sum);  // Expected: 31
```

2. Find the minimum value
```c
int min = values[0];
// Your loop here
printf("Min = %d\n", min);  // Expected: 1
```

3. Count how many values are greater than 5
```c
int count = 0;
// Your loop here
printf("Count = %d\n", count);  // Expected: 3
```

---

layout: header-two-column

@header
## ⚠️ Out-of-Bounds Access
### C WILL NOT SAVE YOU

@main
```c
int a[3] = {10, 20, 30};

printf("%d\n", a[3]);  // Reading garbage!
a[5] = 99;             // Corrupting memory!
a[-1] = 42;            // Also out of bounds!
```

**Possible outcomes:**
- Crash (segfault)
- Overwrite another variable
- Silent data corruption
- Security vulnerability (buffer overflow!)
- Works today, crashes tomorrow

@media
### Why No Safety?
**Java**: `ArrayIndexOutOfBoundsException`
**C**: &ensp;&ensp;&nbsp; Undefined Behavior

<br>

What does this code do?
```c
int scores[3] = {85, 90, 88};
int secret = 12345;

scores[3] = 0; 
printf("secret = %d\n", secret);
// Output: ?
```

💡 **Rule:** Always ensure `0 ≤ index < SIZE`

---

layout: header-content

@header
## Common Array Patterns

@main
### Reverse Print (no modification)
```c
#define SIZE 5
int arr[SIZE] = {1, 2, 3, 4, 5};

for (int i = SIZE - 1; i >= 0; i--) {
    printf("%d ", arr[i]);
}
// Output: 5 4 3 2 1
```

### Copy Array
```c
int source[SIZE] = {1, 2, 3, 4, 5};
int dest[SIZE];

for (int i = 0; i < SIZE; i++) {
    dest[i] = source[i];
}
```

---

layout: "header" "main" / 1fr
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

@header
## 💻 Activity: Array Transformations

@main
**Start with:**
```c
#define SIZE 6
int arr[SIZE] = {2, 5, 1, 8, 3, 9};
```

**1. Replace each element with running sum**
```c
// After: arr = {2, 7, 8, 16, 19, 28}
// (arr[i] = sum of all elements from 0 to i)
```

**2. Shift all elements left by 1** (first element goes to end)
```c
// After: arr = {5, 1, 8, 3, 9, 2}
// Hint: Save the first element before shifting
```

**3. Reverse the array**
```c
// After: arr = {5, 4, 3, 2, 1}
// Hint: Swap the current index element with the (array length - index) element in a loop
```

---



layout: header-two-column

@header
## Strings: The `char` Array

@main
C does not have a `String` type.
C has **Arrays of Characters**.

```c
char name[6] = {'H', 'e', 'l', 'l', 'o', '\0'};
```

### The Sentinel: `\0` (Null Terminator)
How does `printf` know when the name ends?
It looks for the special character `\0` (ASCII value 0).

**Without `\0`, the string never ends.**

@media
### String Literals
A shorthand for the array above:
```c
// Compiler automatically adds '\0'
char name[] = "Hello"; 
```
Size is 6 bytes (5 letters + 1 null).

**Visualizing Memory:**
`['H']['e']['l']['l']['o']['\0']`

---

layout: "header" "main" / 1fr
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

@header
## 💻 Activity: Calculate string length
**Java has `s.length()`. In C, we have to count.**

@main
**Task:** Write a loop that counts how many characters are in `text` before the `\0`.

```c
char text[] = "Programming";
int length = 0;

// YOUR CODE HERE
// 1. Loop until you hit '\0'
// 2. Increment length
// 3. DO NOT count the '\0' itself


printf("Length is: %d\n", length); // Expected: 11
```

*Hint: You can use a `while` loop checking `text[length] != ...`*

---

layout: header-two-column
<!-- notes:
Scanset
 // %19 captures up to 19 chars; [^\n] reads until a newline
scanf("%19[^\n]", name); 

Why 19? Need 1 slot for `\0`!)

Or fgets
-->

@header
## Reading Strings

@main
### Using `scanf`
```c
char name[20];
printf("Enter name: ");

scanf("%s", name); 
```

**Restriction:** `scanf` stops at the first space character!
Input: `The Human`
Stored: `The`

### What are some ways that this can be fixed?

@media
### Another Danger: Buffer Overflow
What if the user types 100 letters into `name[20]`?

**C will crash or corrupt memory.**

**Solution:**
```c
scanf("%19s", name); // Read max 19 chars
```
### Why 19?


---

layout: header-two-column

@header
## 2D Arrays (Matrices)

@main
### Declaration & Access
```c
#define ROWS 3
#define COLS 4

// A 3x4 grid of integers
int grid[ROWS][COLS] = {
    {1, 2, 3, 4},
    {5, 6, 7, 8},
    {9, 10, 11, 12}
};

// Accessing elements
int secondRowThirdColumn = grid[1][2] = 99;
```

**Memory Reality:**
In Java, 2D arrays are "arrays of arrays" (references). 
In C, it is **one solid block** of memory.

@media
### Nested Loop Iteration
```c
for (int i = 0; i < ROWS; i++) {
    for (int j = 0; j < COLS; j++) {
        printf("%4d", grid[i][j]);
    }
    printf("\n");
}
```

### Physical Memory (How it's actually stored)

```d2
Memory: {
  style.border-radius: 8
    
    m0: "[0][0]\n1" {style.fill: lightblue}
    m1: "[0][1]\n2" {style.fill: lightblue}
    m2: "[0][2]\n3" {style.fill: lightblue}
    m3: "[0][3]\n4" {style.fill: lightblue}
    
    m4: "[1][0]\n5" {style.fill: lightgreen}
}
```

---

layout: header-two-column

@header
## The `sizeof` Trap

@main
```c
#define SIZE 5
int arr[SIZE] = {1, 2, 3, 4, 5};

printf("Array size: %zu bytes\n", sizeof(arr));
// Output: 20 (5 ints × 4 bytes)

printf("Element count: %zu\n", sizeof(arr) / sizeof(arr[0]));
// Output: 5
```

**Useful for calculating array length:**
```c
int nums[] = {10, 20, 30, 40};
int count = sizeof(nums) / sizeof(nums[0]);
// count = 4
```

@media
### ⚠️ The Trap
This only works **where the array is declared!**

Next week we'll see that when you pass an array to a function, `sizeof` no longer gives you the full array size.

**For now:** Always track array size with a `#define` constant.

```c
#define SIZE 10
int data[SIZE];
// Always use SIZE, never sizeof in loops
```

---

layout: header-two-column

@header
## Debugging Loops & Arrays

@main
### Print Tracing
```c
for (int i = 0; i < SIZE; i++) {
    printf("DEBUG: i=%d, arr[i]=%d\n", i, arr[i]);
    // ... rest of loop
}
```

### Compiler Warnings
```bash
gcc -Wall -Wextra program.c -o program
```
Catches:
- Empty loop bodies
- Uninitialized variables
- Some bounds issues

@media
### Common Bugs Checklist
- [ ] Off-by-one: `i <= SIZE` vs `i < SIZE`
- [ ] Semicolon after `for()`/`while()`
- [ ] Uninitialized array elements
- [ ] Out-of-bounds access
- [ ] Forgetting to update loop variable
- [ ] Using `=` instead of `==`
- [ ] Wrong array index in nested loops

---

layout: header-content

@header
## Summary: The C Mindset

@main
### Three Key Concepts
1.  **Arrays are Raw Memory:** No `.length`. No bounds checking. You are the safety net.
2.  **Strings use Sentinels:** It's just a `char[]`. It **must** end with `\0`.
3.  **Loops are Literal:** Computers do exactly what you say (even if you accidentally say "do nothing forever").

<br>

### The "Save Your Grade" Checklist
- [ ] **Initialize:** `int arr[5] = {0};` (Kill the garbage values)
- [ ] **Bounds:** `0` to `SIZE - 1`. Never go higher.
- [ ] **Syntax:** No semicolon after `for(...)` or `while(...)`!
- [ ] **Space:** String arrays need size `N+1` to fit the `\0`.

**Next week:** **Functions & The Call Stack**. 