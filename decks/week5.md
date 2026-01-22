
---

layout: header-two-column

<!-- notes: Show that Python can model domain data cleanly, but behavior belongs in methods/services. -->

@header
## Dataclasses (Pythonic OOD)

@main
### Great for domain records
- less boilerplate
- clearer intent
- supports immutability (`frozen=True`)

@media
```py
from dataclasses import dataclass

@dataclass(frozen=True)
class Money:
  cents: int

  def __post_init__(self):
    if self.cents < 0:
      raise ValueError("Money can't be negative")
```

---

layout: header-two-column

<!-- notes: Testing is a design feedback tool. If a unit test is hard to write, your design is too coupled. -->

@header
## Design for Testability
### Tests need seams

@main
### Make it easy to replace:
- network calls
- filesystem
- time
- randomness

### Techniques
- dependency injection
- pure functions for rules
- small protocols

@media
```py
class FakeRepo:
  def __init__(self):
    self.saved = []
  def save(self, order):
    self.saved.append(order)
```

---

layout: header-content

<!-- notes: Connect to course: “modules as components”. Packaging boundaries matter. -->

@header
## Modules are Design Too
### Organize code like a system

@main
- package = component boundary
- limit imports across layers
- keep domain independent from infrastructure

Example structure:
- `domain/` (entities, rules)
- `services/` (use cases)
- `infrastructure/` (db, http)
- `ui/` (cli/web)

---


---

layout: header-content

<!-- notes: Frame as heuristics, not laws. Show why: protects changeability and testability. -->

@header
## SOLID (Practical Version)

@main
### Five heuristics for better designs

- **S**ingle Responsibility: one reason to change (**SRP**)
- **O**pen/Closed: extend without editing core logic (**OCP**)
- **L**iskov Substitution: derived types keep promises (**LSP**)
- **I**nterface Segregation: small focused interfaces (**ISP**)
- **D**ependency Inversion: depend on abstractions (**DIP**)

---

layout: header-two-column

<!-- notes: SRP is about change reasons, not “one method per class”. -->

@header
## SRP: One Reason to Change
### Separate responsibilities by change pressure

@main
### Smell
> A class changes for unrelated reasons.

### Example split
- `Order` (domain rules)
- `OrderRepository` (storage)
- `OrderReceiptRenderer` (formatting)

@media
```py
class OrderReceiptRenderer:
  def render_text(self, order: "Order") -> str:
    return "\n".join(
      ["Receipt", f"items={len(order.items())}"]
    )
```

---

layout: header-two-column

<!-- notes: Show “strategy” concept. Same call site, plug different behavior. -->

@header
## OCP: Extend Without Rewriting
### Add features by adding code, not editing core

@main
### Strategy example
- new shipping rules
- new payment providers
- new file formats

@media
```py
from typing import Protocol

class ShippingCost(Protocol):
  def cost(self, weight_kg: float) -> int: ...

class FlatRate:
  def cost(self, weight_kg: float) -> int:
    return 799

class ByWeight:
  def cost(self, weight_kg: float) -> int:
    return int(400 + 120 * weight_kg)
```

---

layout: header-content

<!-- notes: Make it concrete: if code expects a Notifier, it shouldn't break when you pass SMSNotifier. -->

@header
## LSP: Keep Promises
### If it looks like a duck...

@main
- Subtypes must be usable where the base is expected
- Don’t strengthen preconditions or weaken postconditions

Example: a `FileStore.save()` shouldn’t suddenly reject valid keys.

Mini example (LSP violation):
```py
class Store:
  def save(self, key: str, value: bytes) -> None: ...

class ReadOnlyStore(Store):
  def save(self, key: str, value: bytes) -> None:
    raise RuntimeError("read-only")
```

Better:
- separate interfaces: `Reader` vs `Writer`
- or make read-only behavior explicit in the type/name

---

layout: header-two-column

<!-- notes: Particularly useful in Python with Protocols. Small Protocols make fakes easy in unit tests. -->

@header
## ISP: Small Interfaces
### Don't force clients to depend on methods they don't use

@main
Prefer:
- `UserReader`
- `UserWriter`

Over:
- `UserRepositoryEverything`

@media
```py
from typing import Protocol

class UserReader(Protocol):
  def get(self, user_id: str) -> dict: ...

class UserWriter(Protocol):
  def save(self, user: dict) -> None: ...
```

---

layout: header-two-column

<!-- notes: Show the direction of dependency: high-level policy shouldn't import low-level details. -->

@header
## DIP: Dependency Inversion
### High-level policy depends on abstractions

@main
### Typical goal
- core logic has no HTTP/SQL details
- infrastructure is “plugged in”

### Result
- easier tests
- easier swaps (SQLite → Postgres)

@media
```py
class OrderService:
  def __init__(self, repo: "OrderRepo") -> None:
    self._repo = repo

  def place_order(self, order: "Order") -> None:
    # domain rules here...
    self._repo.save(order)
```
