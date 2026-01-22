# 🧪 Lab 2: Loops, Arrays & Strings
**Duration:** 2 Hours
**Submission:** GitHub Classroom

---

## Part 0: The Warm-Up (10-15 Minutes)
**"The Broken Search"**

The following code attempts to find the second-largest number in an array, but it is riddled with C-specific bugs.
1.  Copy the code into your IDE (VS Code / CLion).
2.  **Do not rewrite the logic entirely.** Your goal is to fix the syntax and logic errors to make *this specific algorithm* work.
3.  **Deliverable:** Show your working code to the TA or submit `warmup_fixed.c`.

```c
#include <stdio.h>

int main() {
    int arr[5] = {3, 7, 2, 9, 5};
    int largest = arr[0];
    int second;  // Bug 1: Uninitialized (contains garbage)
    
    // Bug 2: Loop condition (<= 5 goes out of bounds)
    // Bug 3: Semicolon after for loop (empty body)
    for (int i = 0; i <= 5; i++); 
    {
        // Because of the semicolon, this block runs only ONCE 
        // after the loop finishes, causing logic chaos.
        if (arr[i] > largest) {
            second = largest;
            largest = arr[i];
        } else if (arr[i] > second) {
            second == arr[i];  // Bug 4: Comparison (==) instead of assignment (=)
        }
    }
    
    printf("Second largest: %d\n", second);
    return 0;
}
```

---

## Part 1: The Palindrome Detector
**Focus:** String iteration, comparing indices from both ends.

Write a program that asks the user for a single word and checks if it is a **palindrome** (reads the same forwards and backwards, e.g., "civic", "radar", "level").

### Requirements:
1.  Declare a `char` array of size 100.
2.  Use `scanf` to get input.
3.  Calculate the string length manually (or use `<string.h>` if allowed).
4.  Use a loop to compare the characters.
    *   *Hint:* Compare index `0` with `last`, index `1` with `second-to-last`, etc.
5.  Print "Is a palindrome" or "Not a palindrome".

### Example Output:
```text
Enter a word: racecar
racecar is a palindrome.

Enter a word: hello
hello is not a palindrome.
```

### 🌶️ Optional Spice (Bonus):
Make it **case-insensitive**. Treat 'R' and 'r' as the same letter.
*Hint: In ASCII, 'a' is 97 and 'A' is 65. The difference is 32.*

---

## Part 2: The Caesar Cipher
**Focus:** Modifying array content, char-to-int math, generic algorithms.

A Caesar Cipher is a simple encryption technique where each letter in the text is shifted down the alphabet by a fixed number of positions.

**Task:** Write a program that encrypts a message given by the user.

### Requirements:
1.  Read a message (string) from the user (assume no spaces for simplicity, or use `scanf("%[^\n]", str)` to read with spaces).
2.  Read a "shift" amount (integer).
3.  Iterate through the string:
    *   If the character is a lowercase letter ('a'-'z'), shift it.
    *   **Wrap around:** If shifting 'z' by 1, it should become 'a'.
    *   Ignore non-alphabetic characters (punctuation/numbers remain unchanged).
4.  Print the encrypted string.

### The Math Hint:
To wrap around 'z' back to 'a', you can use the modulo operator `%` or a simple `if` check.
```c
// Concept
char original = 'z';
int shift = 1;
// Result should be 'a'
```

### Example Output:
```text
Enter message: attack
Enter shift: 1
Encrypted: buubdl

Enter message: zebra
Enter shift: 2
Encrypted: bgdtc
```

---

## 📝 Instructor/TA Guide (Solutions)

### Part 0 Solution (Debug)
The students need to catch 4 specific bugs.
```c
#include <stdio.h>

int main() {
    int arr[5] = {3, 7, 2, 9, 5};
    int largest = arr[0];
    int second = -1; // FIX 1: Initialize (or set to smallest possible integer)
    
    // FIX 2: Remove semicolon
    // FIX 3: Change <= 5 to < 5
    for (int i = 1; i < 5; i++) { // Start i at 1 since we initialized with arr[0]
        if (arr[i] > largest) {
            second = largest;
            largest = arr[i];
        } else if (arr[i] > second && arr[i] != largest) {
            second = arr[i];  // FIX 4: Assignment (=), not equality (==)
        }
    }
    
    printf("Second largest: %d\n", second);
    return 0;
}
```

### Part 1 Solution (Palindrome)
```c
#include <stdio.h>
#include <string.h>

int main() {
    char str[100];
    printf("Enter a word: ");
    scanf("%99s", str); // Safety limit

    int len = strlen(str);
    int isPalindrome = 1; // boolean flag

    // Loop halfway through
    for (int i = 0; i < len / 2; i++) {
        // Compare front (i) vs back (len - 1 - i)
        if (str[i] != str[len - 1 - i]) {
            isPalindrome = 0;
            break;
        }
    }

    if (isPalindrome)
        printf("%s is a palindrome.\n", str);
    else
        printf("%s is not a palindrome.\n", str);

    return 0;
}
```

### Part 2 Solution (Caesar Cipher)
```c
#include <stdio.h>

int main() {
    char str[100];
    int shift;

    printf("Enter message: ");
    scanf("%99s", str);
    printf("Enter shift: ");
    scanf("%d", &shift);

    for (int i = 0; str[i] != '\0'; i++) {
        // Only shift lowercase letters
        if (str[i] >= 'a' && str[i] <= 'z') {
            // Convert 'a' to 0, shift, mod 26, convert back to ASCII
            str[i] = ((str[i] - 'a' + shift) % 26) + 'a';
        }
    }

    printf("Encrypted: %s\n", str);
    return 0;
}
```
```