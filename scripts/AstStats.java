import dev.kof.compiler.DiagnosticCollector;
import dev.kof.compiler.Token;
import dev.kof.compiler.parser.Lexer;
import dev.kof.compiler.parser.Parser;

import java.io.File;
import java.nio.file.Files;
import java.util.List;
import java.lang.reflect.Field;
import java.util.Collection;

public class AstStats {

    public static void main(String[] args) throws Exception {
        if (args.length == 0) {
            System.err.println("Usage: java -cp ... AstStats <file.kf>");
            System.exit(1);
        }
        
        File file = new File(args[0]);
        String source = Files.readString(file.toPath());
        
        DiagnosticCollector diagnostics = new DiagnosticCollector();
        Lexer lexer = new Lexer(source, file.getName(), diagnostics);
        List<Token> tokens = lexer.tokenize();
        
        Parser parser = new Parser(tokens, diagnostics, file.getName());
        Object ast = parser.parse();
        
        int tokenCount = tokens.size();
        int astNodes = countNodes(ast, java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>()));
        int loc = source.split("\n").length;
        
        System.out.println("Stats for " + file.getName() + ":");
        System.out.println("LOC: " + loc);
        System.out.println("Tokens: " + tokenCount);
        System.out.println("AST Nodes: " + astNodes);
        

    }

    private static int countNodes(Object node, java.util.Set<Object> visited) {
        if (node == null) return 0;
        if (!visited.add(node)) return 0;
        
        if (node instanceof Collection) {
            int c = 0;
            for (Object item : (Collection<?>) node) {
                c += countNodes(item, visited);
            }
            return c;
        }
        
        String className = node.getClass().getName();
        if (!className.startsWith("dev.kof.compiler")) {
            return 0; // Skip strings, primitives, standard library types
        }
        if (className.equals("dev.kof.compiler.Token") || className.equals("dev.kof.compiler.SourcePosition") || className.equals("dev.kof.compiler.TokenType")) {
            return 0; // Don't double count tokens or source positions in AST
        }
        
        int count = 1; // Count this AST node
        
        // Use reflection to traverse fields
        Class<?> clazz = node.getClass();
        while (clazz != null && clazz != Object.class) {
            for (Field f : clazz.getDeclaredFields()) {
                f.setAccessible(true);
                try {
                    Object val = f.get(node);
                    count += countNodes(val, visited);
                } catch (Exception e) {
                    // Ignore
                }
            }
            clazz = clazz.getSuperclass();
        }
        
        return count;
    }
}
