```markdown
# code_style.md

## Purpose

This file defines code style rules for Python projects.  
The primary documentation style is **Google style docstrings**.  
The rules apply to all new and modified files.

If a rule conflicts with project-specific settings, the priority is:

1. Explicit project settings (`pyproject.toml`, `setup.cfg`, `.ruff.toml`).
2. This file.
3. PEP 8 / Google Python Style Guide.

If something is ambiguous, ask — do not guess.

---

## General Principles

- Readability beats brevity.
- Explicit is better than implicit.
- Simple is better than complex.
- Code should be understandable without additional explanation.
- Do not optimize prematurely.
- Do not add dependencies without necessity.
- Follow PEP 8, PEP 257, and the Google Python Style Guide.
- For Python 3.10+, use modern type syntax.

---

## Tools

- Formatter: **Black** or `ruff format`.
- Linter: **Ruff** (or `flake8` + `isort`).
- Type checker: **mypy** or **pyright**.
- Tests: **pytest**.
- Documentation: Google style docstrings, Sphinx / mkdocstrings.

Before finishing a task, if the tools are available, run:

```bash
ruff check .
ruff format --check .
mypy .
pytest
```

---

## Language

- Code, identifiers, file and directory names — in English.
- Docstrings — in English.
- Comments — in English.
- Commit messages — in English.
- README, CHANGELOG, guides — in English (or in the team's language,
  if the project is internal and this is explicitly agreed upon).
- Error messages and logs — in English.
- Exception messages (`raise ValueError("...")`) — in English.

---

## Formatting

- Indentation — 4 spaces.
- Line length — 88 characters (Black default).
- Strings — double quotes `"..."`, unless there is a reason to use single quotes.
- In multiline structures, put a trailing comma after the last element.
- Between top-level functions and classes — 2 blank lines.
- Between methods inside a class — 1 blank line.
- Do not use `\` for line continuation; use parentheses.
- Do not leave trailing whitespace or extra blank lines.

---

## Imports

- Group imports:
  1. standard library,
  2. third-party libraries,
  3. local modules.
- One blank line between groups.
- Sorting: `isort` or `ruff`.
- Prefer absolute imports.
- Wildcard imports are forbidden: `from module import *`.
- Do not import inside functions unless necessary.
- If you need to defer an import to avoid cycles, add a comment explaining why.

Example:

```python
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel

from myproject.core import settings
from myproject.utils import helpers
```

---

## Naming

- `snake_case` — functions, variables, modules.
- `PascalCase` — classes.
- `UPPER_CASE` — constants.
- `_private` — internal functions, methods, attributes.
- Do not use Hungarian notation.
- Do not use single-letter names, except for counters and coordinates.
- Names should reflect meaning, not type.

---

## Typing

- Type annotations are mandatory for all public functions and methods.
- For Python 3.9+, use built-in generic types: `list[str]`, `dict[str, int]`.
- Use `X | None` instead of `Optional[X]`.
- Do not use `Any` unless necessary.
- For complex types, create a `TypeAlias`.
- For dictionaries with a fixed structure, use `TypedDict`, `dataclass`, or `pydantic.BaseModel`.
- Check types with mypy or pyright.

Example:

```python
from collections.abc import Iterable
from typing import TypeAlias

UserId: TypeAlias = int

def get_user_names(user_ids: Iterable[UserId]) -> list[str]:
    ...
```

---

## Docstrings: Google style

Docstrings are mandatory for all public modules, classes, functions, and methods.

### General Rules

- The first line is a short description. Start with a capital letter, end with a period.
- If the docstring is multiline, put a blank line after the first line.
- Use sections:
  - `Args:`
  - `Returns:`
  - `Yields:`
  - `Raises:`
  - `Attributes:`
  - `Example:`
- If type annotations are present, do not duplicate types in the docstring.
- If there are no annotations, specify the type in parentheses.
- For private functions, the docstring may be omitted if the meaning is obvious.

### Function

```python
def calculate_total(
    price: float,
    quantity: int,
    discount: float = 0.0,
) -> float:
    """Calculate the total order cost.

    Args:
        price: Price per unit.
        quantity: Number of units.
        discount: Discount as a fraction between 0.0 and 1.0.

    Returns:
        Total cost after the discount is applied.

    Raises:
        ValueError: If quantity is negative or discount is outside [0, 1].

    Example:
        >>> calculate_total(100.0, 2, 0.1)
        180.0
    """
    if quantity < 0:
        raise ValueError("quantity must be >= 0")
    if not 0.0 <= discount <= 1.0:
        raise ValueError("discount must be between 0.0 and 1.0")

    return price * quantity * (1.0 - discount)
```

### Class

```python
class User:
    """A system user.

    Attributes:
        id: Unique identifier.
        name: Display name.
        email: Email address.
    """

    def __init__(self, id: int, name: str, email: str) -> None:
        """Initialize a user.

        Args:
            id: Unique identifier.
            name: Display name.
            email: Email address.
        """
        self.id = id
        self.name = name
        self.email = email
```

### Module

```python
"""Module for working with orders.

Contains models and functions for calculating costs and placing orders.
"""
```

---

## Comments

- Comments explain **why**, not **what**.
- Do not duplicate code with comments.
- Do not leave commented-out code.
- For tasks, use the format:

```python
# TODO(name): task description
# FIXME(name): problem description
```

---

## Functions and Classes

- One function — one responsibility.
- A function should be short. If it is longer than ~40 lines, consider splitting it.
- No more than 5 arguments. Otherwise, use a dataclass, TypedDict, or config.
- Do not use mutable default values: `def f(x=[])`.
- Prefer composition over inheritance.
- For data, use `@dataclass` or pydantic.
- Avoid global variables.

---

## Error Handling

- Do not catch `Exception` unless necessary.
- Do not ignore exceptions.
- Create custom exceptions for domain errors.
- Use `raise ... from e` to preserve the cause.
- Validate input at system boundaries.
- Do not use exceptions for flow control.

Example:

```python
class OrderError(Exception):
    """Base order error."""

class OrderNotFoundError(OrderError):
    """Order not found."""

try:
    order = repository.get(order_id)
except DatabaseError as e:
    raise OrderNotFoundError(f"Order {order_id} not found") from e
```

---

## Logging

- Use `logging`, not `print`.
- One logger per module:

```python
import logging

logger = logging.getLogger(__name__)
```

- Levels:
  - `debug` — debugging.
  - `info` — important events.
  - `warning` — potential problems.
  - `error` — errors, but the application continues running.
  - `critical` — critical failures.
- Do not log secrets, passwords, or tokens.
- Do not use f-strings in logs unless necessary; prefer `logger.info("User %s logged in", user_id)`.

---

## Tests

- Use `pytest`.
- Files: `test_*.py`.
- Functions: `test_*`.
- Structure: Arrange — Act — Assert.
- Cover edge cases.
- Mock external dependencies.
- Do not test private methods directly if they can be verified through the public API.
- Do not make tests dependent on each other.

---

## Security

- Do not store secrets in code.
- Use environment variables or secret managers.
- Do not use `eval`, `exec`, or `pickle` for untrusted data.
- For SQL, use parameterized queries.
- Validate and sanitize input.

---

## Performance

- Do not optimize prematurely.
- Use generators for large data.
- Avoid O(n²) if O(n log n) or O(n) is possible.
- Profile before optimizing.
- Cache only where it is justified.

---

## Git

- Do not create commits; they are created by the user.
- Edit .gitignore to add system-specific files.
- At the end of a task, suggest possible commit messages for the changes made.
- Commit message — short, in the imperative mood.
- Commit messages — in English.

---

## Rules for Cline

- Follow this file for all new and modified code.
- Do not reformat the entire file unless the task requires it.
- Preserve the existing style if it does not contradict these rules.
- When adding a public API, update the docstring and type annotations.
- Before finishing a task, run the available checks: linter, formatter, types, tests.
- If a rule is ambiguous, ask a question.
- Do not add new dependencies without explicit necessity.

---

## Pre-Finish Checklist

- [ ] Code is formatted with Black / Ruff.
- [ ] No linter errors.
- [ ] Types are checked with mypy / pyright.
- [ ] Public APIs have Google style docstrings.
- [ ] Tests are added or updated.
- [ ] No secrets or debug code.
- [ ] No commented-out code.
- [ ] Imports are sorted and grouped.
```