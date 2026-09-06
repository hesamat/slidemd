layout: media-span-left
background: #F7D99F

@header

# Strings and Immutability

@main

- Strings cannot be changed in place
- Every operation returns a new string
- Rebinding a variable is not mutation
- We capture the new value with an assignment:
```
greeting = 'hello world'
new_greeting = greeting.upper( )
print(greeting)      # unchanged
```

@media

<img src="images/image1.png" width="695" height="463" alt="illustration" style="width: 100%; height: auto; object-fit: contain;">

@footer

Course Materials 2026