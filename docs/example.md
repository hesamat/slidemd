s a non-trivial amount of math in programming:

- Quantitative trading
- Graphics (polygon mesh processing and geometric mesh modelling)
- Statistics
- Predictive analysis
- Machine learning
- AI
- Big Data

- Python has a math module
- Check out some of those functions!
- ceil( )
- floor( )
- fabs( )
- pow( )
- trunc( )

@footer

COMP 1510 202610

---

layout: title-slide
background: #071d28
theme: dark

@title

## RANDOM NUMBERS: EXPLORING THE RANDOM MODULE

## DEMO TIME! Let’s try it out together!

@footer

COMP 1510 202610

---

layout: header-content
background: linear-gradient(#0d63b0 0%, #0d63b0 23%, #0b5394 69%, #0b4e8b 97%)

@header

## More useful modules (we will use many!)

@main

- string
- copy
- pydoc
- doctest and unittest
- pprint
- statistics
- getpass
- itertools
- unittest.mock
- argparse
- http
- http.client
- http.server
- sys
- time
- typing
- timeit
- os
- json
- csv
- zipfile
- difflib
- filecmp
- os.path
- secrets
- datetime
- subprocess
- webbrowser
- numpy
- pandas
- matplotlib
- re
- and so very many more!

@footer

COMP 1510 202610

---

<!-- notes:  -->

layout: header-content

@header

## Repetition (iteration)

@main

- Sometimes we want to repeat a command
- Counting
- Looping
- While X is true, do Y
- For each A in the group called B, do C
- Do S while T is less than W
- Then we continue with the sequence…

Statement

Statement

Statement

Statement

Boolean expression

True

False

@footer

COMP 1510 202610

---

layout: header-content

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image25.jpeg" width="960" height="720" alt="image25">

## The first two repetition control structures we will use are:

## “for” and

## “while”

@footer

COMP 1510 202610

---

layout: header-content

@header

## Introducing the for-loop

@main

```
a_string_is_a_sequence = "ABC"
for ``letter`` in ``a_string_is_a_sequence``:
    print(letter)
```

## A

## B

## C

## We say: “For every _letter_ in _a_string_is_a_sequence_, print the _letter_”

@footer

COMP 1510 202610

---

layout: header-content
background: #E6C5AC

@header

## Rules for the for-loop

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image26.jpeg" width="485" height="720" alt="image26">

- The **loop body** is repeated once for each element in the sequence
- The loop body is **indented** , and can be any number of lines
- There is no maximum loop duration
- We can use any name we want for the **repeating variable** , but it is best to use a **singular name**
- During each loop, the repeating variable is **bound** for that loop to the address of the next element in the sequence
- When the loop reaches the end of the list, the loop **ends gracefully**
- **Don't forget the colon :**

@footer

COMP 1510 202610

---

layout: header-content

@header

## Introducing the while-loop

@main

```
number = 1
while`` number <= 5``:
    print(number)
    number += 1
```

## 1

## 2

## 3

## 4

## 5

We say: “While number is less than or equal to 5, print number and then increment number”

@footer

COMP 1510 202610

---

layout: two-column

@header

## There is an important difference

@main

- A for-loop executes a block of code once for each item in a sequence
- This is called definite iteration we know it will always visit all the elements in the sequence

@media

- A while-loop runs as long as, i.e., ‘while’ an assertion (Boolean condition) is True
- This is called indefinite iteration, i.e., it doesn’t always loop the same number of times

@footer

COMP 1510 202610

---

layout: header-content
background: #bfbfbf

@header

## There are lots of way to use the while

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image27.jpeg" width="522" height="720" alt="image27">

## We can use a counter:

- Initialize an integer counter outside the loop (give it an initial value)
- Assert in the guard condition that the counter is still within ‘bounds’
- Execute some code in the loop
- Remember to increment (or decrement) the counter inside the loop so that we get closer to the condition.

@footer

COMP 1510 202610

---

layout: header-content
background: #000000
theme: dark

@header

## While loop with a counter set outside the loop

@main

```
count = 0
while count < 5:
    print("Sweatpants are a sign of defeat.")
    print("You lost control of your life.")
    print("So you bought some sweatpants.")
    count += 1
```

- This catty and irreverent quote is attributed to Karl Lagerfeld 🕶

@footer

COMP 1510 202610

---

layout: header-content
background: #bfbfbf

@header

## There are lots of way to use the while

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image27.jpeg" width="522" height="720" alt="image27">

## We can use a Boolean sentinel:

- Set a Boolean outside the loop (give it an initial value of True or False)
- check in the guard condition that the Boolean is still True/False
- Execute some code in the loop
- Remember to include code in the while loop that eventually changes the Boolean.

@footer

COMP 1510 202610

---

layout: title-slide
background: #000000
theme: dark

@title

## While loop with a Boolean sentinel value

```
continue_looping = True
while continue_looping:
    # do some stuff
    user = input("Enter Q to quit: ")
    if user.strip().upper() == "Q":
        continue_looping = False
```

@footer

COMP 1510 202610

---

layout: two-column
background: #000000
theme: dark

@header

## While loops work with any sentinel value

@main

```
user_input = ""
while user_input.trim().lower() != "quit":
    # do some stuff
    user_input = input("a meaningful prompt")
```

@media

## This is a sentinel value. It guards, like a sentinel!

@footer

COMP 1510 202610

---

layout: header-content

@header

## Infinite loops

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image28.jpeg" width="720" height="540" alt="image28">

- If we do not eventually fail the guard condition, the while-loop will never, ever end
- We call this an infinite loop:

```
count = 0
while count < 5:
    print("This is my life now")
    # What’s the bug?!
```

@footer

COMP 1510 202610

---

layout: two-column
background: #153F08
theme: dark

@header

## I shouldn’t be telling you this, but…

@main

- There are two slightly controversial commands in programming
- Python uses them a LOT
- They are:
- break
- continue

Go ahead. Whisper it to me. I won’t tell a soul, I promise!

@media

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image29.png" width="693" height="720" alt="image29">

@footer

COMP 1510 202610

---

layout: header-content
background: #EDDBC4

@header

## The break statement

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image30.jpeg" width="585" height="720" alt="image30">

- We can use break to exit a loop immediately!
- It exits the loop without:
- Checking the guard condition
- Executing any more code in the loop after the break statement
- This is considered Pythonic
- _The rule is: do what makes the code easy to understand_

@footer

COMP 1510 202610

---

<!-- notes:  -->

layout: two-column

@header

## Begone with thine heresy!

@main

```
while True:
    choice = input("helpful prompt")
    if choice.trim().lower() == "quit":
        break # exit the while loop
    # do some stuff
```

## But Sire this is Pythonic!

Java

@media

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image31.gif" width="1280" height="720" alt="image31">

@footer

COMP 1510 202610

---

layout: header-content

@header

## Continue

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image32.png" width="720" height="720" alt="image32">

- The continue statement returns to the beginning of the loop
- The rest of the code in the loop is ignored

```
index = 0
while index < 10:
    index += 1
    if index % 2 == 0:
        continue
    print(index, end=" ")
```

@footer

COMP 1510 202610

---

layout: header-content
background: #000000
theme: dark

@header

## Remember this paradigm 1!

@main

```
continue_game = True
while continue_game:
    # execute a bunch of code
    repeat = input("Continue? Y or N")
    if repeat.strip().lower( ) == "n":
        continue_game = False
```

@footer

COMP 1510 202610

---

layout: header-content
background: #000000
theme: dark

@header

## Remember this paradigm 2!

@main

```
while True:
    # execute a bunch of code
    repeat = input("Continue? Y or N")
    if repeat.strip().lower( ) == "n":
        break
```

@footer

COMP 1510 202610

---

layout: header-content

@header

## Modern programming is structured!

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image33.tiff" width="1280" height="720" alt="image33">

- ✅ _Sequence_
- ✅ _Selection_
- ✅ _Repetition_
- _And now Indirection!_

@footer

COMP 1510 202610

---

<!-- notes:  -->

layout: header-content

@header

## Indirection

@main

- _It is tempting to write programs as one long, long, long sequence_
- This is challenging to:
- Understand
- Decode and debug
- Maintain
- _Programmers divide code into modules_
- Self-contained “chunks” of code that allows a sequence of statements to be referenced by a single statement
- Subroutines, functions, procedures, structures, subprograms…
- Easy to share, maintain, debug, grow, etc.

START

END

Statement

Ask for help from SPECIALIST

RETURN

SPECIALIST

Statement

Statement

Statement

@footer

COMP 1510 202610

---

layout: header-content
background: #45C3FD

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image34.jpeg" width="802" height="720" alt="image34">

- In order to write serious programs, we need to modularize our code
- Scripts are fine for DevOps
- Scripts are not fine for programming
- We will begin writing code in named, re-usable blocks called functions
- We will store groups of related functions in source files
- We will call these source files modules
- We will write programs that import code from other modules.

@footer

COMP 1510 202610

---

layout: header-content

@header

## Flowchart example: indirection

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image35.png" alt="image35">

@footer

COMP 1510 202610

---

layout: header-content
background: #3B5E00
theme: dark

@header

## Motivation for indirection

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image36.jpeg" width="720" height="406" alt="image36">

- Writing code in one long sequence is not a good idea
- Difficult to read
- Difficult to maintain
- Instead, we employ indirection and organize our code into small reusable modules
- The smallest module is the function.

@footer

COMP 1510 202610

---

layout: two-column

@header

## Anatomy of a function definition

@main

```
def print_greeting( ):
    print('Hello there!')
```

## Function body or implementation is one or more lines of code

## Notice the indentation (4 spaces == 1 tab)? It is mandatory!

## Function header or signature always includes parentheses

@media

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image37.png" width="1280" height="720" alt="image37">

@footer

COMP 1510 202610

---

layout: header-content
background: #000000
theme: dark

@header

## Some functions require information

@main

- When a function requires information, we say it _accepts\*\* parameters_
- We must pass values to such a function for it to work
- We call the values that we pass to the function _arguments_
- Every function call can be made many times with a different (or the same) argument each time

```
def print_greeting(name):
    print('Hello ‘ + str(name))
```

@footer

COMP 1510 202610

---

layout: header-content
background: #000000
theme: dark

@header

## Some functions require lots of info

@main

- Functions accept a _comma-separated list of parameters_
- Order matters (for now!)
- ALL arguments must be provided in the order listed by the parameters

```
def divide(dividend, divisor):
        quotient = dividend / divisor
        return quotient
```

@footer

COMP 1510 202610

---

layout: header-content
background: #87C5BA

@header

## We can return values from functions

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image38.png" width="593" height="720" alt="image38">

- Introducing the return statement
- We *use a return statement*to return a value from a function

```
def add(first, second):
    sum = first + second
    return sum
```

@footer

COMP 1510 202610

---

layout: title-slide
background: linear-gradient(#0ab9c1 0%, #0ab9c1 23%, #089ca3 69%, #089298 97%)

@title

## I’d use our add function like this:

```
cost_of_snacks = tally_items_in_cart( )
taxes = calculate_taxes(cost_of_snacks)
total = add(cost_of_snacks, taxes)
# will print the value in total
print(total)
```

@footer

COMP 1510 202610

---

layout: header-content
background: #000000
theme: dark

@header

## A function may call a function may call…

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image39.png" width="751" height="609" alt="image39">

- A function's statements may include function calls
- A function may call a function or several functions
- These are known as _hierarchical_ or _nested\*\* function calls_
- Functions should be very short and atomic
- Functions should do one thing
- Just one thing
- If a function does more than one thing, it should be “decomposed” into two or more functions

@footer

COMP 1510 202610

---

layout: header-content
background: #002F55
theme: dark

@header

## Here’s a function calling a function:

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image40.png" width="720" height="320" alt="image40">

`user_input = int( input( ) )`

## This statement consists of a hierarchical function call:

- The input( ) function is called and returns the address of the string received from the operating system
- The value returned from the input( ) function is IMMEDIATELY passed as an argument to the int( ) function
- The int function accepts the parameter creates an integer object in memory from it and returns the address of the integer
- The returned address of the new integer is bound to the variable user_input.

@footer

COMP 1510 202610

---

layout: two-column
background: #000000
theme: dark

@header

## A function does ONE thing

@main

```
a = 5
b = 4
c = -3
result = sum_of_squares(a, b, c)
print(result)
```

@media

```
def square(operand):
    return operand * operand
def sum_of_squares(x, y, z):
    xx = square(x)
    yy = square(y)
    zz = square(z)
    return xx + yy + zz
```

@footer

COMP 1510 202610

---

layout: header-content
background: #1F1504
theme: dark

@header

## Why use functions?

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image41.jpeg" width="618" height="720" alt="image41">

- Readability
- Modularity
- Reusability
- Reduce complexity
- Minimize redundant code.

## Functions make development much easier.

@footer

COMP 1510 202610

---

layout: header-content

@header

## THIS WILL NOT WORK!

## The interpreter reads the file top down!

@main

## 🚨 Order matters! 🚨

```
# I’m going to invoke (use) a function at the top of my
# file
my_function( )
# But define the function lower down AFTER I invoke it.
def my_function( ):
    print("I defined this function AFTER I invoked it")
```

@footer

COMP 1510 202610

---

layout: two-column

@header

## ARGUMENT

## PASSING

## SEMANTICS

@main

## _How do we provide data to functions?_

- Exactly what are we giving a function when we “pass” a variable to it as an argument?
- Python is called a “pass by value” language
- We make a copy of the value stored in the variable and pass that to the function
- Python variables always contain references (object addresses)
- So Python passes addresses to functions!

@media

@footer

COMP 1510 202610

---

layout: header-content
background: #000000
theme: dark

@header

## The quintessential swap example

@main

## What does this function do in Python?

```
def swap(a, b):
    temp = a
    a = b
    b = temp
```

## Nothing!

@footer

COMP 1510 202610

---

layout: two-column

@header

## Let’s create a memory model

@main

```
def swap(a, b):
    temp = a
    a = b
    b = temp
```

- Let’s pretend this is the memory heap
- When we instantiate data, it is created inside the heap

@media

I am a heap (pile) for data.

Fill me up.

The Python virtual machine will manage my memory.

@footer

COMP 1510 202610

---

layout: two-column

@header

## Let’s create a memory model

@main

```
def swap(a, b):
    temp = a
    a = b
    b = temp
first = 1
last = 100
```

- Now let’s instantiate two integers:

@media

I am a heap (pile) for objects.

Fill me up.

The Python virtual machine will manage my memory.

1

100

@footer

COMP 1510 202610

---

layout: two-column

@header

## Let’s create a memory model

@main

```
def swap(a, b):
    temp = a
    a = b
    b = temp
first = 0xadd01
last = 0xadd02
```

- We know that in Python variables contain the addresses of the objects:

@media

I am a heap (pile) for objects.

Fill me up.

The Python virtual machine will manage my memory.

1

100

@footer

COMP 1510 202610

---

layout: two-column

@header

## Let’s pass our objects to the swap function

@main

```
def swap(a, b):
    temp = a
    a = b
    b = temp
first = 0xadd01
last = 0xadd02
```

`swap(first, last)`

@media

I am a heap (pile) for objects.

Fill me up.

The Python virtual machine will manage my memory.

1

100

@footer

COMP 1510 202610

---

layout: two-column

@header

## 1. Pass the values of the references as the arguments

@main

```
def swap(a=0xadd01, b=0xadd02):
    temp = a
    a = b
    b = temp
first = 0xadd01
last = 0xadd02
```

`swap(first, last)`

These are aliases

@media

I am a heap (pile) for objects.

Fill me up.

The Python virtual machine will manage my memory.

1

100

@footer

COMP 1510 202610

---

layout: two-column

@header

## 2. Execute the first line of code

@main

```
def swap(a=0xadd01, b=0xadd02):
    temp = a
    a = b
    b = temp
first = 0xadd01
last = 0xadd02
```

`temp = a`

These are all aliases

@media

I am a heap (pile) for objects.

Fill me up.

The Python virtual machine will manage my memory.

1

100

@footer

COMP 1510 202610

---

layout: two-column

@header

## 3. Execute the second line of code

@main

```
def swap(a=0xadd02, b=0xadd02):
    temp = a
    a = b
    b = temp
first = 0xadd01
last = 0xadd02
```

`a = b`

These are all aliases

@media

I am a heap (pile) for objects.

Fill me up.

The Python virtual machine will manage my memory.

1

100

@footer

COMP 1510 202610

---

layout: two-column

@header

## 4. Execute the third line of code

@main

```
def swap(a=0xadd02, b=0xadd01):
    temp = a
    a = b
    b = temp
first = 0xadd01
last = 0xadd02
```

`b = temp`

These are all aliases

@media

I am a heap (pile) for objects.

Fill me up.

The Python virtual machine will manage my memory.

1

100

@footer

COMP 1510 202610

---

layout: two-column

@header

## 5. Exit the function

@main

```
def swap(a=0xadd02, b=0xadd01):
    temp = a
    a = b
    b = temp
first = 0xadd01
last = 0xadd02
```

`return`

These are all _deleted_ aliases

@media

I am a heap (pile) for objects.

Fill me up.

The Python virtual machine will manage my memory.

1

100

@footer

COMP 1510 202610

---

layout: two-column

@header

## The swap method did nothing

@main

```
first = 0xadd01
last = 0xadd02
```

- The swap method requires two parameters
- We passed two variables as arguments
- In Python we pass the value in the variable which is always an address
- We messed around with the parameters and the addresses they contain
- The original variables and their values (addresses) remained untouched

@media

I am a heap (pile) for objects.

Fill me up.

The Python virtual machine will manage my memory.

1

100

## _Python** is** a_

## _“ PASS BY VALUE”_

## _language_

## _(Python\*\* is NOT_

## _“ PASS BY REFERENCE”)_

@footer

COMP 1510 202610

---

layout: header-content
background: #262626
theme: dark

@header

## How do we create these “pass by value” functions, Chris?

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image42.jpeg" width="853" height="720" alt="image42">

- Writing a good essay requires planning:
- Deciding on a topic
- Researching background material
- Writing an outline
- Filling in the outline and revising drafts until we are done…
- Making a good function also requires planning

@footer

COMP 1510 202610

---

layout: two-column

@header

## Answer these questions before coding

@main

What do I want to name the function?

What are the **_parameters_** (input) and what types of information do they refer to?

Are there any **_side-effects_**?

What information does the function **_return_**?

What **_calculations_** do I need to do with that information?

@media

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image43.jpeg" width="605" height="720" alt="image43">

@footer

COMP 1510 202610

---

layout: header-content
background: #000000
theme: dark

@header

## Step 1: define the function header

@main

- Define the function header

@footer

COMP 1510 202610

---

layout: header-content
background: #000000
theme: dark

@header

## Step 2: design some simple examples

@main

- Create some examples

@footer

COMP 1510 202610

---

layout: header-content
background: #000000
theme: dark

@header

## Step 3: develop a description

@main

- Develop a description

@footer

COMP 1510 202610

---

layout: header-content
background: #000000
theme: dark

@header

## Steps 4 and 5: body and testing

@main

- Body
- Testing

@footer

COMP 1510 202610

---

layout: header-content

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image44.jpeg" width="482" height="720" alt="image44">

- Remember the sum of squares example from a few slides ago
- We made a function called sum_of_squares
- sum_of_squares used a second function called square
- We broke the task down into two discrete functions
- We say that we decomposed the original problem
- We converted a complex problem into parts that are easier to conceive, understand, program, and maintain
- This makes our code robust, reusable, and scalable.

@footer

COMP 1510 202610

---

layout: header-content

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image45.png" width="560" height="720" alt="image45">

## We want functions that are:

- _Short_ (the fewest lines possible)
- _Atomic_ (cannot be broken down any further)
- _General_ enough to be reused (modular)
- _Understandable_ enough to require minimal comments
- _Simple_ to test individually.

@footer

COMP 1510 202610

---

layout: header-content
background: #000000
theme: dark

@header

## We call this functional decomposition

@main

- Start with a large solution by identifying what it does (use a flowchart and identify the VERBS!)
- Break VERBS off one at a time
- You are trying to identify steps of the algorithm that are:
- Identify the arguments and the output to each portion (block) of code
- Extract the code and put it into its own function with a semantically meaningful name
- Replace the point of extraction with a call to the new function, passing the required inputs and assigning the return value to a local variable.

@footer

COMP 1510 202610

---

layout: header-content
background: #577577
theme: dark

@header

## How do we know we are done?

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image46.jpeg" width="737" height="720" alt="image46">

- That’s an important question!
- Different developers can have different answers
- We want short functions (no more than 10 or 15 lines, and shorter than that if possible)
- Each function:
- Does one logical thing
- Is highly cohesive (solves a small subproblem independently)
- Is loosely coupled to other functions, i.e., it does not need to know how other functions work
- Can be tested easily by itself.

@footer

COMP 1510 202610

---

layout: header-content
background: #018081
theme: dark

@header

## How do we know we are done?

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image47.jpeg" width="521" height="720" alt="image47">

- All our functions are:
- at (roughly) the same level of detail
- easy to understand
- We can describe:
- a function’s main action with ONE simple verb
- what a function does in a sentence or two
- a function’s inputs and output when it has been decomposed
- A well-decomposed function can be:
- thoroughly tested to localize errors and minimize system faults
- assembled with other functions to solve larger problems

@footer

COMP 1510 202610

---

layout: header-content
background: #071d28
theme: dark

@header

## There’s one more piece

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image48.jpeg" alt="image48">

@footer

COMP 1510 202610

---

layout: header-content
background: #FCAC41

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image49.jpeg" width="644" height="720" alt="image49">

- Remember that when a file (module) is imported, all code in the module is immediately executed
- Sometimes we don’t want that, i.e., when we have a program spread over multiple files
- We want to way to tell the interpreter: _Hey interpreter, if this file is being used as a program, go ahead and read the file, but begin execution right here, and only execute this stuff right here!_

@footer

COMP 1510 202610

---

layout: header-content
background: #0F0C0E
theme: dark

@header

## A ‘main’ function

@main

<img src="images/COMP_1510_DTC_202610_Week_03_Sequence_Selection_Repetition_Indirection_image50.jpeg" width="811" height="720" alt="image50">

- Many programming languages use a main function to do this
- _The main function is where the program begins_
- The runtime or interpreter executes the commands in the main function
- When we reach the end of the main function, the program ends
- _Every program can have many files, but only one main function_
- This is the Python approach!

@footer

COMP 1510 202610

---

layout: two-column
background: #000000
theme: dark

@header

## The gateway to the program

@main

- Python uses a built-in variable called **\_\_** name** \_\_** to determine if a file is being directly executed as a program by the programmer, or if the file is being indirectly imported by another module
- If the value of **name** is the string '**main**', then the file is being directly executed as a program

@media

Every module needs a main function and the if-statement you see here

```
def main( ):
    """Execute the program"""
    # Program starts here
    # Doing stuff
    # Doing more stuff
    # Program ends here
# Executes main only if the
# source file is executed, not
# imported
if __name__ == '__main__’:
    main( )
```

@footer

COMP 1510 202610

---

layout: header-content
background: #071d28
theme: dark

@header

## _That’s it for week 03!_

@main

## Thank you for joining me! 謝謝你的到來！

## HOW TO PREPARE FOR WEEK 04:

- BEFORE MONDAY: Review these Week 03 slides and ask me any questions you have on Slack.
- WEEKEND: Download the slides for Week 04 and flip through them to prepare for lectures.
- MONDAY MORNING: Download Lab 03 from the course site. You will have time to work on Lab 03 with me next week in lab.
- NEXT WEEK: Join me during office hours if you need some extra help!

@footer

COMP 1510 202610
