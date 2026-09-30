import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert, Box, Button, Typography } from "@mui/material";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catch render-time crashes and show a readable message instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  /** Initialise the boundary state. */
  state: State = { error: null };

  /** Store the error that broke rendering. */
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  /** Log the error for browser diagnostics. */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  /** Reset the boundary so the app can be rendered again. */
  handleReset = (): void => {
    this.setState({ error: null });
  };

  /** Render either the failed-state UI or the children. */
  render(): ReactNode {
    const { error } = this.state;
    if (error == null) {
      return this.props.children;
    }

    return (
      <Box sx={{ maxWidth: 640, mx: "auto", mt: 8, p: 3 }}>
        <Alert severity="error">
          <Typography variant="h6" gutterBottom>
            Something went wrong
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {error.message}
          </Typography>
          <Button variant="contained" onClick={this.handleReset}>
            Try again
          </Button>
        </Alert>
      </Box>
    );
  }
}