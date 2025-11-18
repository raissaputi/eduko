"""Service for running data visualization code and capturing matplotlib output."""
import io
import base64
from contextlib import redirect_stdout, redirect_stderr
import ast
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


def _figure_has_content(fig) -> bool:
    """Heuristic: return True if any axes has drawable content.
    Helps avoid saving empty white images when a figure exists but nothing was drawn.
    """
    try:
        for ax in fig.get_axes():
            if ax.lines or ax.images or ax.collections or ax.patches or ax.tables or ax.artists:
                return True
    except Exception:
        # If inspection fails for any reason, fall back to assuming it has content
        return True
    return False


def _capture_plot_png_if_any() -> str | None:
    """Return base64 PNG for the first non-empty figure if present; otherwise None.
    Always closes all figures afterwards to keep state clean between runs.
    """
    plot_data: str | None = None
    try:
        fig_nums = plt.get_fignums()
        for num in fig_nums:
            fig = plt.figure(num)
            if _figure_has_content(fig):
                buf = io.BytesIO()
                try:
                    plt.tight_layout()
                except Exception:
                    # Some figures/layouts don't support tight_layout; ignore
                    pass
                fig.savefig(buf, format='png', dpi=100, bbox_inches='tight')
                buf.seek(0)
                plot_data = base64.b64encode(buf.getvalue()).decode('utf-8')
                break
    finally:
        # Ensure we don't leak figures between cells
        plt.close('all')
    return plot_data

def run_dv_code(code: str) -> tuple[str, str, str]:
    """
    Run data visualization code and capture matplotlib output.
    
    Args:
        code: Python code string that generates matplotlib visualization
        
    Returns:
        tuple of:
        - stdout: captured standard output
        - stderr: captured standard error
        - plot: base64 encoded PNG of the matplotlib plot, or None if no plot
    """
    stdout = io.StringIO()
    stderr = io.StringIO()
    plot_data = None
    
    # Common imports for data visualization
    namespace = {
        'plt': plt,
        'np': np,
        'pd': pd,
        'plt.style.use': plt.style.use,
    }

    try:
        # Capture stdout/stderr while running code
        with redirect_stdout(stdout), redirect_stderr(stderr):
            # Reset plots and set style for a clean slate
            plt.close('all')
            plt.clf()
            plt.style.use('bmh')  # Using a built-in style that looks nice

            try:
                # Execute the code
                exec(code, namespace)
            except Exception as e:
                stderr.write(f"Code Error: {str(e)}")
                return stdout.getvalue(), stderr.getvalue(), None

            # Capture the first non-empty figure if any
            plot_data = _capture_plot_png_if_any()
            if plot_data is None:
                # Don't treat as error; just warn in stderr so UI can show a hint
                stderr.write("Warning: No plot was created. Make sure to call plt.plot() or similar.")
    except Exception as e:
        stderr.write(f"Runtime Error: {str(e)}")
        
    return (
        stdout.getvalue(),
        stderr.getvalue(),
        plot_data
    )


def run_dv_cells(cells: list[str]) -> list[dict]:
    """Execute multiple DV cells sequentially with shared namespace.
    Each cell can produce its own stdout, stderr, and optional plot image.

    Returns list of { stdout, stderr, plot } per cell.
    """
    results: list[dict] = []
    # Shared namespace across cells to keep variables/state
    namespace = {
        'plt': plt,
        'np': np,
        'pd': pd,
        'plt.style.use': plt.style.use,
    }
    # Preload a static DataFrame "df" if available so users can call df.head()
    try:
        import os
        csv_path = os.path.abspath("wage-dataset-37830.csv")
        if os.path.exists(csv_path):
            namespace['df'] = pd.read_csv(csv_path)
            namespace['df_wage'] = namespace['df']
    except Exception:
        # Non-fatal if dataset is missing or unreadable
        pass

    for code in cells:
        stdout = io.StringIO()
        stderr = io.StringIO()
        plot_data = None

        with redirect_stdout(stdout), redirect_stderr(stderr):
            # Reset current figure for this cell but keep namespace
            plt.close('all')  # ensure no stale figures carry over
            plt.clf()
            plt.style.use('bmh')

            # Try to emulate notebook behavior: show last expression value
            last_value = None
            try:
                tree = ast.parse(code, mode='exec')
                if tree.body and isinstance(tree.body[-1], ast.Expr):
                    # Split: run all but last expr, then eval last expr
                    body_wo_last = ast.Module(body=tree.body[:-1], type_ignores=getattr(tree, 'type_ignores', []))
                    last_expr = ast.Expression(body=tree.body[-1].value)
                    compiled_a = compile(body_wo_last, '<cell>', 'exec')
                    exec(compiled_a, namespace)
                    compiled_b = compile(last_expr, '<cell>', 'eval')
                    last_value = eval(compiled_b, namespace)
                else:
                    # No trailing expression; execute as-is
                    exec(code, namespace)
            except SyntaxError:
                # Fallback to normal exec if parsing fails
                exec(code, namespace)
            except Exception as e:
                stderr.write(f"Code Error: {str(e)}")

            # Auto-display last value like notebooks
            if last_value is not None:
                try:
                    if 'pd' in namespace and isinstance(last_value, namespace['pd'].DataFrame):
                        print(last_value.to_string())
                    elif 'pd' in namespace and isinstance(last_value, namespace['pd'].Series):
                        print(last_value.to_string())
                    else:
                        # Generic repr
                        print(repr(last_value))
                except Exception:
                    # If printing last value fails, ignore
                    pass

            # Capture the first non-empty figure if any
            plot_data = _capture_plot_png_if_any()

        results.append({
            'stdout': stdout.getvalue(),
            'stderr': stderr.getvalue(),
            'plot': plot_data
        })

    return results