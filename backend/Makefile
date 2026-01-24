.PHONY: install run dev clean venv

venv:
	python3 -m venv venv

install: venv
	./venv/bin/pip install -r requirements.txt

run:
	./venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001

dev:
	./venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

clean:
	rm -rf venv __pycache__ .pytest_cache
