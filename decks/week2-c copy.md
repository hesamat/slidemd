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
## Where We Are in the Course

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
- **Week 4:** Pointers (the big reveal!)
- **Week 5:** Strings & Memory Safety

---

layout: header-content

@header
## By the end of today you can...

@main
- Safely write **`while`**, **`for`**, and **`do-while`** loops in C
- Declare, initialize, and iterate over **arrays**
- Explain **3 key differences** between C & Java arrays
- Avoid the **semicolon-of-death**, **off-by-one**, and **`sizeof`** traps
- Implement **linear search** through an array
- Debug loop/array bugs using tracing & compiler warnings

---

layout: "header header" "quote quote" "main media" / 1fr 1fr

@header
## The "Memory" Problem
### Why Java arrays lie to you

@quote
> In Java, arrays are objects with babysitters. In C, arrays are memory addresses with no supervision.

@main
### The Java Illusion
- `int[] arr = new int[10];`
- `arr.length` property exists
- Bounds checking at runtime
- Garbage collection cleans up

### The C Reality
- `int arr[10];`
- No length metadata
- No bounds checking
- You manage everything

@media
```d2
direction: down

JavaArray: Java Array (Object) {
  shape: class
  style: {
    fill: "#e3f2fd"
    stroke: "#1565c0"
    stroke-width: 3
    font-size: 24
  }
  
  metadata: "✓ Length property\n✓ Bounds checking\n✓ Garbage collected" {
    style: {
      fill: "#bbdefb"
      font-size: 18
    }
  }
  
  data: "[values...]" {
    style: {
      fill: "#ffffff"
      font-size: 20
    }
  }
}

CArray: C Array (Memory) {
  shape: rectangle
  style: {
    fill: "#ffebee"
    stroke: "#c62828"
    stroke-dash: 5
    stroke-width: 3
    font-size: 24
  }
  
  raw: "[raw values...]\n⚠ No safety net" {
    style: {
      fill: "#ffffff"
      font-size: 20
    }
  }
}

JavaArray -> CArray: Remove the wrapper {
  style: {
    stroke-dash: 3
    font-size: 18
  }
}
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
- No boolean type in C89 (use `int`: 0 = false)
- Braces `{}` optional for single statements (dangerous!)
- No `for-each` loop like Java's `for (int x : arr)`
- Must manually track loop termination

**When to use each:**
- **`while`**: Unknown iteration count
- **`for`**: Known count or array traversal
- **`do-while`**: Need at least one execution

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
// Output: 0 1 2
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
**Each snippet has a C-specific bug. Find and fix them.**

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
    if (i == 2) continue;
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
    if (i % 3 == 0) continue;  // Skip multiples of 3
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
## Why Arrays?

@main
❌ **Without arrays:**
```c
int g1, g2, g3, g4, g5;
scanf("%d %d %d %d %d", 
      &g1, &g2, &g3, &g4, &g5);

int sum = g1 + g2 + g3 + g4 + g5;
// What if we need 100 grades?!
```

✅ **With arrays:**
```c
#define SIZE 5
int grades[SIZE];

for (int i = 0; i < SIZE; i++) {
    scanf("%d", &grades[i]);
}
// Easy to change SIZE to 100!
```

@media
**Use arrays when you have:**
- Multiple values of the **same type**
- Need to process them with a **loop**
- Need to access values by **position**

**Key insight:** Arrays + loops = powerful combination for processing collections of data.

---

layout: header-two-column

@header
## Declaring & Initializing Arrays

@main
```c
// Uninitialized (DANGER: garbage values!)
int scores[5];

// Full initialization
int scores[5] = {90, 80, 70, 60, 50};

// Partial → rest become 0
int scores[5] = {90, 80};
// Result: {90, 80, 0, 0, 0}

// Let compiler count
int scores[] = {90, 80, 70}; // size = 3

// All zeros (common pattern!)
int counts[100] = {0};
```

@media
### ⚠️ Uninitialized = Garbage
```c
int mystery[3];
printf("%d\n", mystery[0]); 
// Could print ANYTHING!
```

**In Java:** `new int[3]` gives you zeros.
**In C:** Local arrays contain garbage unless you initialize them.

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
int a[4] = {5, 10};
// a[0] = ?  a[1] = ?  a[2] = ?  a[3] = ?

int b[] = {2, 4, 6, 8, 10};
// Size of b = ?

int c[3] = {0};
// c[0] = ?  c[1] = ?  c[2] = ?

int d[4] = {7};
// d[0] = ?  d[1] = ?  d[2] = ?  d[3] = ?
```

---

layout: "header header" "main media" / 1fr 1fr

@header
## Array = Contiguous Memory

@main
`int arr[5] = {10, 20, 30, 40, 50};`

In memory (assuming `int` = 4 bytes):

| Address  | Value | Index    |
|----------|-------|----------|
| `0x1000` | `10`  | `arr[0]` |
| `0x1004` | `20`  | `arr[1]` |
| `0x1008` | `30`  | `arr[2]` |
| `0x100C` | `40`  | `arr[3]` |
| `0x1010` | `50`  | `arr[4]` |

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

<div style="margin: 2rem 12rem;">

```c
#define SIZE 5
int data[SIZE] = {10, 20, 30, 40, 50};

// Print all elements
for (int i = 0; i < SIZE; i++) {
    printf("data[%d] = %d\n", i, data[i]);
}
```

</div>

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

layout: "header" "main" / 1fr
background: linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)

@header
## 💻 Activity: Implement Linear Search
**You've done this in Java. Now implement it in C.**

@main
**Problem:** Find if a target value exists in an array. Return its index, or -1 if not found.

```c
#define SIZE 7
int data[SIZE] = {4, 2, 9, 1, 7, 3, 8};
int target = 7;
int found_index = -1;  // -1 means "not found"

// YOUR CODE HERE:
// Write a loop that searches for target in data[]
// If found, set found_index to the index and stop searching


// Test your solution:
if (found_index != -1) {
    printf("Found %d at index %d\n", target, found_index);
} else {
    printf("%d not found\n", target);
}
```

**Hints:** Use `break` when found. Start with index 0. Check each element.

---

layout: header-two-column

@header
## Linear Search: Discussion

@main
### The Algorithm
1. Start at index 0
2. Check each element one by one
3. If match found → save index and stop
4. If loop ends without match → not found

@media
### Time Complexity
- **Best case:** 1 comparison (found at start)
- **Worst case:** N comparisons (at end or not found)
- **Average:** N/2 comparisons

### When to Use
- Unsorted data
- Small arrays
- One-time searches

*Later: Binary search is faster for sorted arrays!*

---

layout: "header" "main" / 1fr
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

@header
## 💻 Activity: Linear Search Variations

@main
**Using this array:**
```c
#define SIZE 8
int nums[SIZE] = {5, 3, 8, 3, 9, 3, 1, 7};
```

**1. Find LAST occurrence of 3**
```c
int target = 3;

// Expected result: last_index = 5
```

**2. Count ALL occurrences of 3**
```c
int target = 3;

// Expected result: count = 3
```

**3. Find index of the LARGEST element**
```c
int max_index = -1;

// Expected result: max_index = 4 (value 9)
```

---

layout: header-two-column

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

@media
### Reverse In-Place
```c
#define SIZE 5
int arr[SIZE] = {1, 2, 3, 4, 5};

for (int i = 0; i < SIZE / 2; i++) {
    int j = SIZE - 1 - i;
    // Swap arr[i] and arr[j]
    int temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
}
// arr is now {5, 4, 3, 2, 1}
```

**Key insight:** Only need to swap first half with second half!

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

layout: "header" "main" / 1fr
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

@header
## 💻 Activity: Debug This Program

@main
**This program should find the second-largest element. It has multiple bugs. Find and fix them all.**

```c
#include <stdio.h>

int main() {
    int arr[5] = {3, 7, 2, 9, 5};
    int largest = arr[0];
    int second;  // Bug: uninitialized
    
    for (int i = 0; i <= 5; i++);  // Bug: semicolon and bounds
    {
        if (arr[i] > largest) {
            second = largest;
            largest = arr[i];
        } else if (arr[i] > second) {
            second == arr[i];  // Bug: wrong operator
        }
    }
    
    printf("Second largest: %d\n", second);
    return 0;
}
```

---

layout: header-two-column

@header
## Preview: Strings = `char` Arrays

@main
In C, a **string** is a `char` array ending with `'\0'` (null terminator).

```c
char name[10] = "Alice";
// Stored as: {'A','l','i','c','e','\0',...}
```

The `'\0'` marks where the string ends.

```c
#include <string.h>
printf("Length: %zu\n", strlen(name));
// Output: 5 (doesn't count '\0')
```

@media
### Common Mistake
```c
char str[5] = "Hello";
// NO ROOM for '\0'!
// Need at least char str[6]
```

### We'll Cover Later
- String input/output
- String manipulation
- String comparison
- Common vulnerabilities

---
layout: header-content
background: linear-gradient(135deg, #eef2ff 0%, #f8fafc 100%)

@header
## Wrap-Up

@main
### Big Ideas
- **Power & Responsibility:** C gives you direct memory access, but you are the safety net.
- **Arrays are Raw Memory:** No `.length`, no bounds checks. You must track the `SIZE`.
- **Syntax vs. Semantics:** What you *write* isn't always what you *mean*. Beware the semicolon of death! (`for(...);`)

### Essential Habits
- **Discipline is Mandatory:** Always use `#define SIZE` and check bounds (`0 <= i < SIZE`).
- **Initialize Everything:** Garbage values are everywhere. Start with known values (`arr[N] = {0};`).
- **Trust Your Tools:** Compile with `-Wall -Wextra`. Let the compiler be your first debugger.

**Next week:** **Functions & The Call Stack**. What *really* happens when you pass an array to a function?