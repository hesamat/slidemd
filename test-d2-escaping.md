# Test D2 Escaping

---

## D2 Diagram Test

Testing D2 with special characters that need escaping:

```d2
x -> y: "Hello & goodbye"
y -> z: 'Single quotes'
a -> b: <script>alert('test')</script>
```

This should properly escape &, ", ', <, and > characters.
